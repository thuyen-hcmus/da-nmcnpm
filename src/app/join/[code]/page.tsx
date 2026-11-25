import { Student } from "./Student";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Student code={code.toUpperCase()} />;
}
