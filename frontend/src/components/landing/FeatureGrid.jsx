import Reveal from "./Reveal";
import { CARD, CARD_HOVER, ICON_TILE } from "./motion3d";

/**
 * What the software does, as six equivalent things.
 *
 * This is the one section where a uniform grid of cards is the right answer
 * rather than the lazy one: these six are genuinely peers - six areas of the
 * same product, none of them a step in a sequence, none more important than
 * the rest. The workflow section below is where order matters, and it is drawn
 * as a line for exactly that reason.
 *
 * Every line of copy here names something the application actually has. The
 * bullet lists are the screens and rules behind each area, not adjectives.
 */
export default function FeatureGrid({ features }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {features.map(({ icon: Icon, title, body, points, highlight }, index) => (
        <Reveal
          key={title}
          // Stagger by column, not by index: on a three-up grid, delaying by
          // index makes the third card in a row wait for two cards that are
          // already on screen beside it, which reads as lag rather than as
          // sequence. Modulo means each row starts its stagger over.
          delay={(index % 3) * 0.07}
          className="h-full"
        >
          <article
            className={`group flex h-full flex-col p-6 sm:p-7 ${CARD} ${CARD_HOVER} ${
              highlight ? "bg-gradient-to-b from-brand-50/70 to-white" : ""
            }`}
          >
            {/* The hairline that warms up on hover. Absolutely positioned and
                pointer-events-none, so it cannot eat a click meant for the
                card, and it animates opacity only. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-brand-400 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />

            <div className={ICON_TILE}>
              <Icon className="h-[22px] w-[22px]" />
            </div>

            <h3 className="mt-5 text-base font-bold tracking-tight text-slate-900 sm:text-lg">
              {title}
            </h3>

            <p className="mt-2.5 text-sm leading-relaxed text-slate-500">{body}</p>

            <ul className="mt-5 space-y-2 border-t border-slate-100 pt-5">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-[13px] text-slate-600">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300 transition-colors duration-300 group-hover:bg-brand-500"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </article>
        </Reveal>
      ))}
    </div>
  );
}
