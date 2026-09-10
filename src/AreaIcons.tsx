import {
  BookOpen,
  Briefcase,
  Home,
  Heart,
  Leaf,
  Compass,
  GraduationCap,
  FlaskConical,
  Palette,
  Music,
  Camera,
  Plane,
  Globe,
  Dumbbell,
  Coffee,
  Users,
  Calendar,
  Target,
  Lightbulb,
  Code,
  Laptop,
  Mountain,
  Bike,
  Car,
  Wallet,
  Building,
  Sprout,
  PawPrint,
  Star,
  Utensils,
} from "lucide-react";
const icons = {
  briefcase: Briefcase,
  home: Home,
  book: BookOpen,
  heart: Heart,
  leaf: Leaf,
  compass: Compass,
  graduation: GraduationCap,
  science: FlaskConical,
  art: Palette,
  music: Music,
  camera: Camera,
  travel: Plane,
  globe: Globe,
  fitness: Dumbbell,
  coffee: Coffee,
  people: Users,
  calendar: Calendar,
  goals: Target,
  ideas: Lightbulb,
  code: Code,
  technology: Laptop,
  outdoors: Mountain,
  cycling: Bike,
  car: Car,
  money: Wallet,
  business: Building,
  growth: Sprout,
  pets: PawPrint,
  star: Star,
  food: Utensils,
};
export function AreaIcon({ icon }: { icon?: string }) {
  const Icon = icons[icon as keyof typeof icons] ?? BookOpen;
  return <Icon size={16} aria-hidden="true" />;
}
export function AreaIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <details className="area-icon-picker">
      <summary>
        <AreaIcon icon={value} />
        Choose icon
      </summary>
      <div role="group" aria-label="Area icons">
        {Object.keys(icons).map((key) => (
          <button
            key={key}
            type="button"
            title={key}
            aria-label={`${key} icon`}
            aria-pressed={key === value}
            onClick={() => onChange(key)}
          >
            <AreaIcon icon={key} />
          </button>
        ))}
      </div>
    </details>
  );
}
