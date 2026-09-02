import LandingHero from "@/components/offerpilot/LandingHero";
import LandingSteps from "@/components/offerpilot/LandingSteps";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-neutral-900 font-sans">
      <LandingHero />
      <LandingSteps />
    </main>
  );
}
