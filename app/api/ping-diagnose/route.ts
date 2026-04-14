import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    main_judgment: "测试成功",
    core_issues: [],
    audit_rows: []
  });
}