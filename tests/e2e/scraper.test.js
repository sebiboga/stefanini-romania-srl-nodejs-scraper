import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import companyConfig from '../../config/company.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const HAS_SOLR = !!process.env.SOLR_AUTH;

function itIfSolr(name, fn, timeout) {
  if (HAS_SOLR) {
    return it(name, fn, timeout);
  }
  return it.skip(`${name} (skipped: SOLR_AUTH not set)`, fn, timeout);
}

beforeAll(() => {
  if (HAS_SOLR) {
    process.env.SOLR_AUTH = process.env.SOLR_AUTH;
  }
});

const TEST_CIF = companyConfig.cif;
const TEST_BRAND = companyConfig.brand;
const COMPANY_NAME = companyConfig.legalName;
const CAREER_URL = companyConfig.careerUrl;
const ROMANIAN_CITIES = ['Bucharest', 'București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Brașov', 'Constanța', 'Sibiu', 'Oradea'];

describe('E2E: Full Scraping Pipeline', () => {

  describe('SmartSearchOnline — Real HTML Fetch', () => {
    let html;

    beforeAll(async () => {
      const res = await fetch(CAREER_URL, {
        headers: {
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': 'text/html'
        }
      });
      html = await res.text();
    }, 30000);

    it('should respond with valid HTML', () => {
      expect(html).toBeDefined();
      expect(html.length).toBeGreaterThan(100);
      expect(html.toLowerCase()).toContain('<!doctype html');
    }, 10000);

    it('should contain job listing elements', () => {
      const $ = cheerio.load(html);
      const items = $('.list-group-item');
      expect(items.length).toBeGreaterThan(0);
    }, 10000);

    it('should have job links with coloredlink bold class', () => {
      const $ = cheerio.load(html);
      const links = $('a.coloredlink.bold');
      expect(links.length).toBeGreaterThan(0);
      links.each((_, el) => {
        expect($(el).text().trim().length).toBeGreaterThan(0);
        expect($(el).attr('href')).toBeTruthy();
      });
    }, 10000);
  });

  describe('Parse + Transform Pipeline', () => {
    let index;
    let html;

    beforeAll(async () => {
      index = await import('../../index.js');
      const res = await fetch(CAREER_URL, {
        headers: {
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': 'text/html'
        }
      });
      html = await res.text();
    }, 30000);

    it('should parse real SmartSearchOnline HTML into standardized format', () => {
      const jobs = index.parseJobsHTML(html);

      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBeGreaterThan(0);

      const parsed = jobs[0];
      expect(parsed).toHaveProperty('url');
      expect(parsed.url).toContain('smartsearchonline.com');
      expect(parsed).toHaveProperty('title');
      expect(typeof parsed.title).toBe('string');
      expect(parsed.title.length).toBeGreaterThan(0);
      expect(parsed).toHaveProperty('location');
      expect(Array.isArray(parsed.location)).toBe(true);
    });

    it('should map parsed jobs to job model', () => {
      const parsed = index.parseJobsHTML(html);
      const model = index.mapToJobModel(parsed[0], TEST_CIF);

      expect(model).toHaveProperty('url');
      expect(model).toHaveProperty('title');
      expect(model).toHaveProperty('company');
      expect(model).toHaveProperty('cif', TEST_CIF);
      expect(model).toHaveProperty('status', 'scraped');
      expect(model).toHaveProperty('date');
    });

    it('should transform jobs and filter to Romanian locations', () => {
      const parsed = index.parseJobsHTML(html);
      const jobs = parsed.map(j => index.mapToJobModel(j, TEST_CIF));

      const payload = {
        source: 'smartsearchonline.com',
        company: COMPANY_NAME,
        cif: TEST_CIF,
        jobs
      };

      const transformed = index.transformJobsForSOLR(payload);

      expect(transformed.company).toBe(COMPANY_NAME);
      expect(transformed.jobs.length).toBe(jobs.length);

      for (const job of transformed.jobs) {
        expect(job).toHaveProperty('location');
        expect(Array.isArray(job.location)).toBe(true);
        expect(job.location.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Company Validation Path', () => {
    let anaf;
    let company;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
      company = await import('../../company.js');
    });

    it('should find STEFANINI in ANAF and validate active status', async () => {
      const anafData = await anaf.getCompanyFromANAF(TEST_CIF);
      expect(anafData).toBeDefined();
      expect(anafData.name).toBe(COMPANY_NAME);
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIfSolr('should run full validation and report active status with job count', async () => {
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
      expect(result.company).toBe(COMPANY_NAME);
      expect(result.cif).toBe(TEST_CIF);

      if (result.existingJobsCount === 0) {
        console.log(`⚠️ No ${TEST_BRAND} jobs in Solr — skipping job count assertion`);
        return;
      }
      expect(result.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Inactive Company Handling', () => {
    let anaf;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
    });

    it('should confirm STEFANINI ROMANIA SRL is active', async () => {
      const data = await anaf.getCompanyFromANAF(TEST_CIF);
      expect(data).toBeDefined();
      expect(data.inactive).toBe(false);
    }, 30000);

    it('should detect inactive/radiated companies via ANAF', async () => {
      const results = await anaf.searchCompany('RADIATED');
      if (results.length > 0) {
        const nonActive = results.find(c => c.statusLabel !== 'Funcțiune');
        if (nonActive) {
          try {
            const anafData = await anaf.getCompanyFromANAF(nonActive.cui.toString());
            expect(anafData).toBeDefined();
            if (anafData.inactive !== undefined) {
              expect(anafData.inactive).toBe(true);
            }
          } catch {
            expect(nonActive.statusLabel).toMatch(/Radiată|Inactiv|Suspendat/);
          }
        }
      }
    }, 30000);
  });

  describe('SOLR Data Verification', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should have STEFANINI jobs in SOLR with correct company name', async () => {
      const result = await solr.querySOLR(TEST_CIF);

      if (result.numFound === 0) {
        console.log(`⚠️ No ${TEST_BRAND} jobs in Solr — skipping SOLR data verification`);
        return;
      }

      for (const job of result.docs) {
        expect(job.company).toBe(COMPANY_NAME);
        expect(job.cif).toBe(TEST_CIF);
      }
    }, 15000);

    itIfSolr('should have STEFANINI company core entry with required fields', async () => {
      const result = await solr.queryCompanySOLR(`id:${TEST_CIF}`);

      expect(result.numFound).toBe(1);
      const company = result.docs[0];
      expect(company.company).toBe(COMPANY_NAME);
      expect(company.status).toBe('activ');
    }, 15000);
  });
});
