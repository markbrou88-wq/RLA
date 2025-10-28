// src/components/PlayerLink.jsx
import React from "react";
import { Link } from "react-router-dom";

/**
 * Usage options:
 *   <PlayerLink id={123}>John Doe</PlayerLink>
 *   <PlayerLink id={123} name="John Doe" number={12} />
 */
export default function PlayerLink({ id, children, name, number, style }) {
  if (!id) return <>{children ?? (number ? `#${number} — ` : "")}{name ?? ""}</>;
  const label = children ?? `${number ? `#${number} — ` : ""}${name ?? ""}`;
  return (
    <Link to={`/players/${id}`} style={{ textDecoration: "none", ...style }}>
      {label}
    </Link>
  );
}
