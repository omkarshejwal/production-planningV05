import { buildExportData } from './src/utils/exportData';

buildExportData('2026-08-01', '2026-08-31', [])
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
