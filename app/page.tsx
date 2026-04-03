import LandingHero from "@/components/offerpilot/LandingHero";
import LandingPreview from "@/components/offerpilot/LandingPreview";
import LandingSteps from "@/components/offerpilot/LandingSteps";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <LandingHero />
        <LandingPreview />
        <LandingSteps />
      </div>
    </main>
  );
}
