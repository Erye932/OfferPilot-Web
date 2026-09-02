import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import * as fs from 'fs';
import * as path from 'path';
import { runV4Diagnosis } from '../lib/diagnose/service';

async function main() {
  console.log('--- Starting OfferPilot V4 Diagnosis ---');
  
  // Read resume text from extracted txt or pdf
  const pdfPath = 'C:\\Users\\Administrator\\Desktop\\简历_产品助理.pdf';
  
  // Use pdf.js or python fitz extracted text
  const textPath = 'C:\\Users\\Administrator\\Desktop\\简历_产品助理.txt';
  let resumeText = '';
  if (fs.existsSync(textPath)) {
    resumeText = fs.readFileSync(textPath, 'utf-8');
  } else {
    // fallback to plain text if needed
    console.error('Missing resume text file');
    process.exit(1);
  }

  console.log('Loaded resume text length:', resumeText.length);
  console.log('Target Role: AI产品经理 / 产品助理');

  const report = await runV4Diagnosis(
    {
      resume_text: resumeText,
      target_role: 'AI产品经理',
      jd_text: '电商AI Agent、客服智能体、Workflow、Vibe Coding 原型搭建、数据驱动转化率优化',
      force_refresh: true,
    },
    {
      onProgress: (step, label, progress) => {
        console.log(`[Progress ${progress}%] [${step}]: ${label}`);
      }
    }
  );

  console.log('=== OFFERPILOT REPORT GENERATED ===');
  console.log(JSON.stringify(report, null, 2));

  fs.writeFileSync('C:\\Users\\Administrator\\Desktop\\offerpilot_diagnosis_result.json', JSON.stringify(report, null, 2), 'utf-8');
  console.log('Report saved to C:\\Users\\Administrator\\Desktop\\offerpilot_diagnosis_result.json');
}

main().catch((err) => {
  console.error('OfferPilot diagnosis error:', err);
  process.exit(1);
});
