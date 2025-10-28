import React from "react";
import { Link } from "react-router-dom";

export default function PlayerLink({ id, children, style }) {
  if (!id) return <>{children}</>;
  return (
    <Link to={`/players/${id}`} style={{ textDecoration: "none", ...style }}>
      {children}
    </Link>
  );
}
