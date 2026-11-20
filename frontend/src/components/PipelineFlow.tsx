import type { Icon } from "@phosphor-icons/react";
import { Browsers, CloudArrowDown, Database, Funnel, Globe, HardDrives } from "@phosphor-icons/react/dist/ssr";

export interface PipelineStep {
  title: string;
  detail: string;
  metric: string;
}

const ICONS: Icon[] = [Globe, CloudArrowDown, Funnel, Database, HardDrives, Browsers];

/**
 * The path a number takes from IMM's portal to this page, as one row of steps with data moving
 * along the joins. Each step carries the figure that proves it ran.
 */
export function PipelineFlow({ steps, label }: { steps: PipelineStep[]; label: string }) {
  return (
    <section aria-label={label} className="flow">
      <ol className="flow-steps">
        {steps.map((step, index) => {
          const StepIcon = ICONS[index] ?? Globe;
          return (
            <li className="flow-step" key={step.title} style={{ animationDelay: `${index * 70}ms` }}>
              <span aria-hidden="true" className="flow-icon">
                <StepIcon size={20} weight="duotone" />
              </span>
              <span className="flow-index">{String(index + 1).padStart(2, "0")}</span>
              <strong className="flow-title">{step.title}</strong>
              <span className="flow-detail">{step.detail}</span>
              <span className="flow-metric">{step.metric}</span>
              {index < steps.length - 1 ? <span aria-hidden="true" className="flow-join" style={{ animationDelay: `${index * 0.35}s` }} /> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
