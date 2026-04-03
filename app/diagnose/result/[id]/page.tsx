import DiagnoseResult from "@/components/offerpilot/DiagnoseResult.next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DiagnoseResultPage({ params }: PageProps) {
  const { id } = await params;
  return <DiagnoseResult reportId={id} />;
}