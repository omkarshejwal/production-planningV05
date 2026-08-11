const ExcelJS = require('exceljs');

async function readExcelDate() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('test_date.xlsx');
  const worksheet = workbook.getWorksheet('Test');
  
  const valA1 = worksheet.getCell('A1').value;
  const valB1 = worksheet.getCell('B1').value;
  
  console.log("A1 value:", valA1, "(typeof:", typeof valA1, ")");
  console.log("B1 value:", valB1, "(typeof:", typeof valB1, ")");
}

readExcelDate();
