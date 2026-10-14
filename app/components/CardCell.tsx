"use client";
import { type CellComponentProps } from "react-window";
import {
  type Item,
  type View,
  type Game,
  type PlayStatus,
  type Rating,
  type StarRating,
} from "../types";
import { scoreClass } from "../gameLogic";
import { STATUS_LABELS, STATUS_COLORS, RATING_EMOJI } from "../constants";
import { StatusGlyph, CoverPlaceholder, StarGlyph } from "./Glyphs";
export function CardCell({
  columnIndex,
  rowIndex,
  style,
  items,
  games,
  view,
  columnCount,
  statusMap,
  ratingMap,
  starMap,
  pollMode,
  pollSelected,
  onTogglePollSelect,
}: CellComponentProps<{
  items: Item[];
  games: Record<number, Game>;
  view: View;
  columnCount: number;
  statusMap: Record<number, PlayStatus>;
  ratingMap: Record<number, Rating>;
  starMap: Record<number, StarRating>;
  pollMode: boolean;
  pollSelected: Set<number>;
  onTogglePollSelect: (appid: number) => void;
}>) {
  const index = rowIndex * columnCount + columnIndex;
  const item = items[index];
  if (!item) return <div style={style} />;
  const g = games[item.appid];
  const status = statusMap[item.appid];
  const rating = ratingMap[item.appid];
  const star = starMap[item.appid];
  const linkable = item.appid > 0;
  const cardContent = (
    <>
      <div className="cardCover">
        {g?.headerImage ? (
          <img src={g.headerImage} alt="" loading="lazy" decoding="async" />
        ) : (
          <CoverPlaceholder loaded={!!g} />
        )}
        {view === "wishlist" && (g?.metacritic != null || g?.reviewPositive) ? (
          <div className="cardBadges cardBadgesBottomRight">
            {g.metacritic != null ? (
              <span className={"cardBadge " + scoreClass(g.metacritic)}>메타 {g.metacritic}</span>
            ) : null}
            {g.reviewPositive ? (
              <span className={"cardBadge " + scoreClass(g.reviewPositive)}>
                리뷰 {g.reviewPositive}%
              </span>
            ) : null}
          </div>
        ) : null}
        {/* Platform/DLC badges are hidden in the library tab's card layout specifically - card
            view is meant to stay visually light, and both are still visible/actionable (including
            the manual-remove button) from the list layout. Wishlist card view is unaffected. */}
        {view !== "library" && g?.isDlc ? (
          <div className="cardBadges">
            <span className="cardBadge dlcTag">DLC</span>
          </div>
        ) : null}
        {view === "library" && (status || star || rating) ? (
          <div className="cardBadges cardBadgesBottomRight">
            {status && (
              <span className="cardBadge status" style={{ color: STATUS_COLORS[status] }}>
                <StatusGlyph status={status} />
                {STATUS_LABELS[status]}
              </span>
            )}
            {status !== "excluded" && star && (
              <span className="cardBadge stars">
                <StarGlyph />
                {star}
              </span>
            )}
            {status !== "excluded" && rating && (
              <span className="cardBadge">{RATING_EMOJI[rating]}</span>
            )}
          </div>
        ) : null}
      </div>
      <div className="cardInfo">
        <h4>{g?.name ?? `Steam App ${item.appid}`}</h4>
        {view === "library"
          ? item.playtimeMinutes != null && (
              <p className="cardMeta">{(item.playtimeMinutes / 60).toFixed(1)}시간</p>
            )
          : g?.price && (
              <p className="cardMeta">
                {g.price}
                {g.discountPercent ? ` (-${g.discountPercent}%)` : ""}
              </p>
            )}
      </div>
    </>
  );
  const pollChecked = pollMode && pollSelected.has(item.appid);
  return (
    <div style={style} className="cardCellOuter">
      {pollMode && (
        // A sibling of the card body, not nested inside it - the whole card is one big link
        // outside poll mode, so this has to sit on top as its own element to avoid a click on it
        // also triggering navigation.
        <label
          className="pollSelectCheckCard"
          title="투표 후보로 추가"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={pollSelected.has(item.appid)}
            onChange={() => onTogglePollSelect(item.appid)}
          />
        </label>
      )}
      {pollMode ? (
        // In poll mode the card itself is just a big toggle target, not a store link - clicking
        // anywhere on it (not only the small checkbox) selects/deselects the candidate.
        <div
          className={"card pollActive" + (pollChecked ? " pollSelected" : "")}
          onClick={() => onTogglePollSelect(item.appid)}
        >
          {cardContent}
        </div>
      ) : linkable ? (
        <a
          className="card"
          href={`https://store.steampowered.com/app/${item.appid}`}
          target="_blank"
          rel="noopener noreferrer"
          title={g?.name ?? `Steam App ${item.appid}`}
        >
          {cardContent}
        </a>
      ) : (
        <div className="card">{cardContent}</div>
      )}
    </div>
  );
}
