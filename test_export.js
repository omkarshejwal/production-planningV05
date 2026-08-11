import { buildExportData } from './src/utils/exportData.js';

// We'll mock the apiFetch in exportData by overriding global.fetch
global.fetch = async (url) => {
  if (url.includes('machine_no=1')) {
    return {
      ok: true,
      text: async () => JSON.stringify([{
        machine_no: 'MAC-01',
        plan_date: '2026-07-31',
        bottle_id: '1',
        start_time: '08:00',
        status: 'Completed'
      }])
    };
  }
  return {
    ok: true,
    text: async () => JSON.stringify([])
  };
};

buildExportData('2026-08-01', '2026-08-31', [])
  .then(() => console.log('Done'))
  .catch(console.error);
