import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AppExperience = "code" | "work";

export function ExperienceSwitcher({
  value,
  onChange,
}: {
  value: AppExperience;
  onChange: (experience: AppExperience) => void;
}) {
  return (
    <div className="experience-switcher grid grid-cols-2 gap-1 bg-fill-quiet p-1" role="tablist" aria-label="Experience">
      {(["code", "work"] as const).map((experience) => (
        <Button
          key={experience}
          type="button"
          role="tab"
          size="sm"
          variant={value === experience ? "secondary" : "ghost"}
          aria-selected={value === experience}
          className={cn("experience-tab", value === experience && "bg-background text-foreground")}
          onClick={() => onChange(experience)}
        >
          {experience === "code" ? "Code" : "Work"}
        </Button>
      ))}
    </div>
  );
}
