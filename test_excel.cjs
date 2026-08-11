const ExcelJS = require('exceljs');

// Force IST timezone for Node execution
process.env.TZ = "Asia/Kolkata"; 

async function testExcelDate() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Test');

  // Create local date: 2026-08-01 00:00:00 IST
  // In UTC, this is 2026-07-31 18:30:00Z
  const localDate = new Date(2026, 7, 1);
  
  // Create UTC date: 2026-08-01 00:00:00Z
  const utcDate = new Date(Date.UTC(2026, 7, 1));

  worksheet.addRow([localDate, utcDate]);
  
  worksheet.getCell('A1').numFmt = 'dd-mmm-yyyy';
  worksheet.getCell('B1').numFmt = 'dd-mmm-yyyy';

  await workbook.xlsx.writeFile('test_date.xlsx');
  console.log("Local Date inside JS:", localDate.toString());
  console.log("Local Date UTC ISO:", localDate.toISOString());
  console.log("UTC Date inside JS:", utcDate.toString());
  console.log("UTC Date ISO:", utcDate.toISOString());
}

testExcelDate();
