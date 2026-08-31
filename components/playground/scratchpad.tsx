export function Scratchpad() {
  return (
    <section className="border-t border-gray-200 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium text-black">scratchpad</h2>
          <span className="font-mono text-[11px] text-gray-400">
            components/playground/scratchpad.tsx
          </span>
        </div>
        <div className="border border-dashed border-gray-300 bg-gray-50 p-4">
          <p className="text-sm leading-6 text-gray-500">
            Paste temporary components here while experimenting. Keep rough work
            in this area until it deserves a file in components/experiments/.
          </p>
        </div>
      </div>
    </section>
  );
}
