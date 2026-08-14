import { useEffect, useState } from "react";
import { assetUrl } from "../services/api";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-24 w-24 text-3xl",
};

function initialsOf(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * A person's photo — staff profile picture or patient photo — falling back to
 * their initials when there is no image, or when the image fails to load (a
 * deleted file would otherwise leave a broken-image icon on screen).
 */
export default function Avatar({ name, imageUrl, size = "md", className = "" }) {
  const src = assetUrl(imageUrl);
  const [failed, setFailed] = useState(false);

  // A fresh upload changes the URL; clear any previous failure so the new
  // image actually gets a chance to render.
  useEffect(() => setFailed(false), [src]);

  const base = `${SIZES[size] || SIZES.md} shrink-0 overflow-hidden rounded-full ${className}`;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ? `${name}'s photo` : "Photo"}
        onError={() => setFailed(true)}
        className={`${base} object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${base} grid place-items-center bg-gradient-to-br from-brand-500 to-brand-700 font-semibold text-white`}
    >
      {initialsOf(name)}
    </span>
  );
}
