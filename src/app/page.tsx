import { PageRenderer } from "@/components/page/PageRenderer";
import { getRenderSections } from "@/lib/pages";

export default async function Home() {
  const sections = await getRenderSections("home");
  return <PageRenderer sections={sections ?? []} />;
}
