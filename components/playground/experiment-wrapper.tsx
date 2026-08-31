import type { ReactNode } from "react";

type ExperimentWrapperProps = {
  name: string;
  description?: string;
  children: ReactNode;
};

export function ExperimentWrapper({
  name,
  description,
  children,
}: ExperimentWrapperProps) {
  return (
    <section className="border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-medium text-black">{name}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
        ) : null}
      </div>
      <div className="min-h-36 p-4">{children}</div>
    </section>
  );
}
