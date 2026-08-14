import { useState } from "react";
import { HiOutlineEye, HiOutlineEyeSlash } from "react-icons/hi2";

/**
 * A password field with a show/hide toggle.
 *
 * Every prop other than `className` is forwarded to the underlying input, so
 * this drops straight in wherever an `<input type="password" />` was — the
 * `type` is the one thing it owns, since that is what the toggle flips.
 */
export default function PasswordInput({ className = "", ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-600"
      >
        {visible ? (
          <HiOutlineEyeSlash className="h-4.5 w-4.5" />
        ) : (
          <HiOutlineEye className="h-4.5 w-4.5" />
        )}
      </button>
    </div>
  );
}
