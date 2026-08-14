import { useNavigate } from "react-router-dom";
import { HiOutlineCog6Tooth } from "react-icons/hi2";
import GlobalSearch from "./GlobalSearch";
import NotificationMenu from "./NotificationMenu";
import ProfileMenu from "./ProfileMenu";

export default function Topbar() {
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      <GlobalSearch />

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationMenu />
        <button
          onClick={() => navigate("/dashboard/settings")}
          aria-label="Settings"
          className="grid h-10 w-10 place-items-center rounded-full text-slate-500 transition hover:bg-slate-50"
        >
          <HiOutlineCog6Tooth className="h-5 w-5" />
        </button>
        <ProfileMenu />
      </div>
    </header>
  );
}
