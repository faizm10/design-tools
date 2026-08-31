import { experiments } from "@/components/experiments/registry";

export function Playground() {
  return (
    <main className="min-h-screen bg-white text-black">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
          <a className="text-sm font-medium lowercase" href="#">
            design playground
          </a>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-4 md:px-6">
        {experiments.map((experiment) => {
          const ExperimentComponent = experiment.component;

          return (
            <section key={experiment.name}>
              <ExperimentComponent />
            </section>
          );
        })}
      </div>
    </main>
  );
}
