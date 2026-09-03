import { loadSamples } from "@/lib/samples";
import { Dashboard } from "@/components/dashboard";

export default function Home() {
  const samples = loadSamples();
  return <Dashboard initialSamples={samples} />;
}
