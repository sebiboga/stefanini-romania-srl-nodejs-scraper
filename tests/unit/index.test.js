import { jest } from '@jest/globals';
import companyConfig from '../../config/company.js';

describe('index.js Component Tests', () => {
  let index;

  beforeAll(async () => {
    index = await import('../../index.js');
  });

  describe('transformJobsForSOLR', () => {
    it('should filter locations to only Romanian cities', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', location: ['România'] },
          { url: 'https://test.com/2', title: 'Job 2', location: ['Bucharest'] },
          { url: 'https://test.com/3', title: 'Job 3', location: ['Bulgaria'] },
          { url: 'https://test.com/4', title: 'Job 4', location: ['Cluj-Napoca'] },
          { url: 'https://test.com/5', title: 'Job 5', location: [] }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].location).toEqual(['România']);
      expect(result.jobs[1].location).toEqual(['Bucharest']);
      expect(result.jobs[2].location).toEqual(['România']);
      expect(result.jobs[3].location).toEqual(['Cluj-Napoca']);
      expect(result.jobs[4].location).toEqual(['România']);
    });

    it('should keep company uppercase', () => {
      const payload = {
        source: 'smartsearchonline.com',
        company: 'stefanini romania srl',
        cif: '16139707',
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', company: 'stefanini romania', cif: '16139707' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.company).toBe('STEFANINI ROMANIA SRL');
    });

    it('should normalize workmode values', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', workmode: 'Remote' },
          { url: 'https://test.com/2', title: 'Job 2', workmode: 'ON-SITE' },
          { url: 'https://test.com/3', title: 'Job 3', workmode: 'Hybrid' },
          { url: 'https://test.com/4', title: 'Job 4', workmode: 'hybrid' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].workmode).toBe('remote');
      expect(result.jobs[1].workmode).toBe('on-site');
      expect(result.jobs[2].workmode).toBe('hybrid');
      expect(result.jobs[3].workmode).toBe('hybrid');
    });

    it('should handle empty jobs array', () => {
      const result = index.transformJobsForSOLR({ jobs: [] });
      expect(result.jobs).toEqual([]);
    });
  });

  describe('mapToJobModel', () => {
    it('should map raw job to job model format', () => {
      const rawJob = {
        url: 'https://jobs2.smartsearchonline.com/StefaniniEMEA/jobs/job_detail.asp?jobid=123',
        title: 'Senior Developer',
        location: ['Bucharest'],
        tags: ['Java', 'Spring'],
        workmode: 'hybrid'
      };

      const COMPANY_NAME = 'STEFANINI ROMANIA SRL';
      const COMPANY_CIF = '16139707';

      const result = index.mapToJobModel(rawJob, COMPANY_CIF, COMPANY_NAME);

      expect(result.url).toBe(rawJob.url);
      expect(result.title).toBe(rawJob.title);
      expect(result.company).toBe(COMPANY_NAME);
      expect(result.cif).toBe(COMPANY_CIF);
      expect(result.location).toEqual(rawJob.location);
      expect(result.tags).toEqual(rawJob.tags);
      expect(result.workmode).toBe(rawJob.workmode);
      expect(result.status).toBe('scraped');
      expect(result.date).toBeDefined();
    });

    it('should remove undefined fields', () => {
      const rawJob = {
        url: 'https://test.com/1',
        title: 'Job 1'
      };

      const result = index.mapToJobModel(rawJob, '16139707');

      expect(result.location).toBeUndefined();
      expect(result.tags).toBeUndefined();
      expect(result.workmode).toBeUndefined();
    });

    it('should handle missing title', () => {
      const rawJob = { url: 'https://test.com/1' };

      const result = index.mapToJobModel(rawJob, '16139707');

      expect(result.title).toBeUndefined();
      expect(result.url).toBe('https://test.com/1');
    });
  });

  describe('parseJobsHTML', () => {
    it('should parse SmartSearchOnline HTML job listings', () => {
      const html = `
        <html>
        <body>
          <div class="list-group-item">
            <a class="coloredlink bold" href="job_detail.asp?jobid=123">Senior Developer</a>
            <div class="thinrow">Bucharest</div>
            <div class="thinrow">Posted 10 days ago</div>
          </div>
          <div class="list-group-item">
            <a class="coloredlink bold" href="job_detail.asp?jobid=456">Junior Tester</a>
            <div class="thinrow">Cluj-Napoca, Timișoara</div>
            <div class="thinrow">Posted 5 days ago</div>
          </div>
        </body>
        </html>
      `;

      const result = index.parseJobsHTML(html);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Senior Developer');
      expect(result[0].url).toContain('job_detail.asp?jobid=123');
      expect(result[0].location).toEqual(['Bucharest']);
      expect(result[1].title).toBe('Junior Tester');
      expect(result[1].location).toEqual(['Cluj-Napoca', 'Timișoara']);
    });

    it('should skip items without title', () => {
      const html = `
        <html>
        <body>
          <div class="list-group-item">
            <span>No link here</span>
          </div>
        </body>
        </html>
      `;

      const result = index.parseJobsHTML(html);
      expect(result).toHaveLength(0);
    });

    it('should handle empty HTML', () => {
      const result = index.parseJobsHTML('<html><body></body></html>');
      expect(result).toEqual([]);
    });
  });
});
