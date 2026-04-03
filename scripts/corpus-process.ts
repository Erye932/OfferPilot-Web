// 语料清洗与蒸馏脚本
// 从 offerpilot-corpus/raw/ 读取原始资料，清洗后输出到 offerpilot-corpus/cleaned/
// 然后蒸馏为结构化 JSON 输出到 offerpilot-corpus/distilled/

import * as fs from 'fs';
import * as path from 'path';

const CORPUS_ROOT = path.resolve(__dirname, '../offerpilot-corpus');
const RAW_DIR = path.join(CORPUS_ROOT, 'raw');
const CLEANED_DIR = path.join(CORPUS_ROOT, 'cleaned');
const DISTILLED_DIR = path.join(CORPUS_ROOT, 'distilled');

// Issue type taxonomy

/**
 * Clean raw text
 */
function cleanRawText(text: string): string {
  let cleaned = text;
  // Remove BOM
  cleaned = cleaned.replace(/^\uFEFF/, '');
  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n');
  // Remove excessive blank lines
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
  // Remove noise footers (common patterns)
  cleaned = cleaned.replace(/---+\s*end\s*---+/gi, '');
  cleaned = cleaned.replace(/\[AI生成.*?\]/g, '');
  // Remove duplicate headers
  const lines = cleaned.split('\n');
  const seenHeaders = new Set<string>();
  const deduped = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('##')) {
      if (seenHeaders.has(trimmed)) return false;
      seenHeaders.add(trimmed);
    }
    return true;
  });
  cleaned = deduped.join('\n');
  // Trim
  cleaned = cleaned.trim();
  return cleaned;
}

/**
 * Extract text from .txt or .md files
 */
function extractTextFromFile(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf-8');
  }
  // Skip docx - requires mammoth which is async
  // Use the async version for docx
  return null;
}

/**
 * Process raw directory
 */
function processRawDirectory(): void {
  console.log('Processing raw corpus directory...');

  // Ensure output dirs exist
  [CLEANED_DIR, DISTILLED_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Walk raw directory
  const sources = fs.readdirSync(RAW_DIR);
  let totalProcessed = 0;

  for (const source of sources) {
    const sourcePath = path.join(RAW_DIR, source);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      const files = fs.readdirSync(sourcePath);
      for (const file of files) {
        const filePath = path.join(sourcePath, file);
        const text = extractTextFromFile(filePath);
        if (text) {
          const cleaned = cleanRawText(text);
          const outputPath = path.join(CLEANED_DIR, `${source}_${file}`);
          fs.writeFileSync(outputPath, cleaned, 'utf-8');
          totalProcessed++;
          console.log(`  Cleaned: ${source}/${file} -> ${outputPath}`);
        }
      }
    } else if (stat.isFile()) {
      const text = extractTextFromFile(sourcePath);
      if (text) {
        const cleaned = cleanRawText(text);
        const outputPath = path.join(CLEANED_DIR, source);
        fs.writeFileSync(outputPath, cleaned, 'utf-8');
        totalProcessed++;
        console.log(`  Cleaned: ${source} -> ${outputPath}`);
      }
    }
  }

  console.log(`Total files processed: ${totalProcessed}`);
}

/**
 * Verify existing distilled files
 */
function verifyDistilledFiles(): void {
  const requiredFiles = [
    'diagnosis-rules.json',
    'insider-views.json',
    'rewrite-patterns.json',
  ];

  console.log('\nVerifying distilled files...');

  for (const file of requiredFiles) {
    const filePath = path.join(DISTILLED_DIR, file);
    if (fs.existsSync(filePath)) {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      console.log(`  ${file}: ${Array.isArray(content) ? content.length : '?'} entries`);
    } else {
      console.log(`  ${file}: MISSING`);
    }
  }
}

// Main
console.log('=== OfferPilot Corpus Processing ===\n');
processRawDirectory();
verifyDistilledFiles();
console.log('\nDone.');
