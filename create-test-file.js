const XLSX = require('xlsx');
const path = require('path');

// Create test data matching the user's exact format
const testData = [
  ['material name', 'size', 'brand', 'SKU', 'Instock', 'Cost price'],
  ['OTTER', '1 inch (square)', '', '', 1, ''],
  ['WHITE BOARD HANGER', '', '', '', 2, ''],
  ['OTTER', '30mm', '', '', 15, ''],
  ['INER', '30mm', '', '', 2, ''],
  ['ROUND INER CAP', '1inch', '', '', 1, ''],
];

// Create workbook and add data
const ws = XLSX.utils.aoa_to_sheet(testData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Raw Materials');

// Write to file
const filepath = path.join(__dirname, 'test-raw-materials.xlsx');
XLSX.writeFile(wb, filepath);

console.log(`✓ Test file created at: ${filepath}`);
