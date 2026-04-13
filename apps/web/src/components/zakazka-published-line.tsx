import {
  calendarDaysSincePublication,
  publicationAgeAccentClass,
  publicationAgePhraseCs,
} from "@/lib/published-age";

type Props = {
  iso: string;
  /** přehled: kratší datum; detail: delší */
  dateStyle?: "short" | "medium";
};

export default function ZakazkaPublishedLine({ iso, dateStyle = "short" }: Props) {
  const d = new Date(iso);
  const days = calendarDaysSincePublication(d);
  const phrase = publicationAgePhraseCs(days);
  const accent = publicationAgeAccentClass(days);
  const dateLabel =
    dateStyle === "medium"
      ? d.toLocaleString("cs-CZ", { dateStyle: "medium" })
      : d.toLocaleDateString("cs-CZ");

  return (
    <span className={`font-medium ${accent}`}>
      Zveřejněno: {dateLabel} | {phrase}
    </span>
  );
}
