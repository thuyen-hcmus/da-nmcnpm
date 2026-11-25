import { Projector } from "./Projector";

export default async function ProjectorPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Projector code={code} />;
}
