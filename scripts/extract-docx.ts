// DOCX to text extraction script
// Extracts text from docx files in 语料数据库/ and offerpilot-corpus/raw/
// Outputs cleaned text files to offerpilot-corpus/cleaned/

import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RAW_CORPUS_DIR = path.join(PROJECT_ROOT, '语料数据库');
const CORPUS_RAW_DIR = path.join(PROJECT_ROOT, 'offerpilot-corpus', 'raw', 'consulting-notes');
const CLEANED_DIR = path.join(PROJECT_ROOT, 'offerpilot-corpus', 'cleaned');

function cleanText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/^\uFEFF/, '');
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
  cleaned = cleaned.replace(/\[AI.*?\]/g, '');
  cleaned = cleaned.trim();
  return cleaned;
}

async function extractDocx(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function processDirectory(dir: string, label: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    console.log(`  Directory not found: ${dir}`);
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.docx'));
  console.log(`\n  Processing ${label}: ${files.length} docx files`);

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const rawText = await extractDocx(filePath);
      const cleaned = cleanText(rawText);
      const outputName = file.replace('.docx', '.txt');
      const outputPath = path.join(CLEANED_DIR, outputName);
      fs.writeFileSync(outputPath, cleaned, 'utf-8');
      console.log(`    ${file} -> ${outputName} (${cleaned.length} chars)`);
    } catch (error) {
      console.error(`    Failed to process ${file}:`, error);
    }
  }
}

async function main() {
  console.log('=== DOCX Extraction ===');

  if (!fs.existsSync(CLEANED_DIR)) {
    fs.mkdirSync(CLEANED_DIR, { recursive: true });
  }

  await processDirectory(RAW_CORPUS_DIR, '语料数据库');
  await processDirectory(CORPUS_RAW_DIR, 'offerpilot-corpus/raw/consulting-notes');

  console.log('\nDone.');
}

main().catch(console.error);
