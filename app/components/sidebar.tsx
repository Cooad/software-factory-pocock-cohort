import { NavLink, Form } from "react-router";
import { useState, useEffect } from "react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import { UserAvatar } from "~/components/user-avatar";
import { NotificationBell } from "~/components/notification-feed";
import {
  Bookmark,
  BookOpen,
  ChartColumn,
  LayoutDashboard,
  GraduationCap,
  MessageSquare,
  Shield,
  Tag,
  Receipt,
  Users,
  UsersRound,
  Moon,
  Sun,
  LogOut,
  Settings,
} from "lucide-react";

const sidebarRowClass =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";
const sidebarIdleClass =
  "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const sidebarButtonClass = cn(sidebarRowClass, "w-full", sidebarIdleClass);

function sidebarLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    sidebarRowClass,
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : sidebarIdleClass
  );
}

type CurrentUser = {
  id: number;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
};

type RecentCourse = {
  courseId: number;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  completedLessons: number;
  totalLessons: number;
  progress: number;
};

type SidebarProps = {
  currentUser: CurrentUser | null;
  recentCourses?: RecentCourse[];
  isTeamAdmin?: boolean;
};

type NavItem = {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles: UserRole[] | "all";
};

const navItems: NavItem[] = [
  {
    label: "Browse Courses",
    to: "/courses",
    icon: <BookOpen className="size-4" />,
    roles: "all",
  },
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: <LayoutDashboard className="size-4" />,
    roles: [UserRole.Student],
  },
  {
    label: "Saved",
    to: "/saved",
    icon: <Bookmark className="size-4" />,
    roles: [UserRole.Student],
  },
  {
    label: "My Courses",
    to: "/instructor",
    icon: <GraduationCap className="size-4" />,
    roles: [UserRole.Instructor],
  },
  {
    label: "Analytics",
    to: "/instructor/analytics",
    icon: <ChartColumn className="size-4" />,
    roles: [UserRole.Instructor, UserRole.Admin],
  },
  {
    label: "Questions",
    to: "/instructor/questions",
    icon: <MessageSquare className="size-4" />,
    roles: [UserRole.Instructor, UserRole.Admin],
  },
  {
    label: "Manage Users",
    to: "/admin/users",
    icon: <Users className="size-4" />,
    roles: [UserRole.Admin],
  },
  {
    label: "Manage Courses",
    to: "/admin/courses",
    icon: <Shield className="size-4" />,
    roles: [UserRole.Admin],
  },
  {
    label: "Categories",
    to: "/admin/categories",
    icon: <Tag className="size-4" />,
    roles: [UserRole.Admin],
  },
  {
    label: "Refund Requests",
    to: "/admin/refunds",
    icon: <Receipt className="size-4" />,
    roles: [UserRole.Admin],
  },
];

function isVisible(item: NavItem, role: UserRole | null): boolean {
  if (item.roles === "all") return true;
  if (!role) return false;
  return item.roles.includes(role);
}

export function Sidebar({
  currentUser,
  recentCourses = [],
  isTeamAdmin = false,
}: SidebarProps) {
  const currentUserRole = currentUser?.role ?? null;
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDarkMode() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cadence-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
        <NavLink to="/" className="text-lg font-bold tracking-tight">
          Cadence
        </NavLink>
        {currentUser && <NotificationBell />}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems
          .filter((item) => isVisible(item, currentUserRole))
          .map((item) => (
            <NavLink key={item.to} to={item.to} className={sidebarLinkClass}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        {isTeamAdmin && (
          <NavLink to="/team" className={sidebarLinkClass}>
            <UsersRound className="size-4" />
            Team
          </NavLink>
        )}
      </nav>

      {recentCourses.length > 0 && (
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            Recent Courses
          </div>
          <div className="space-y-1">
            {recentCourses.map((course) => (
              <NavLink
                key={course.courseId}
                to={`/courses/${course.slug}`}
                className={({ isActive }) =>
                  cn(
                    "block rounded-md px-3 py-2 transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <div
                  title={course.title}
                  className="line-clamp-2 break-words text-sm font-medium"
                >
                  {course.title}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-sidebar-accent">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs text-sidebar-foreground/50">
                    {course.progress}%
                  </span>
                </div>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-sidebar-border p-3 space-y-1">
        <button onClick={toggleDarkMode} className={sidebarButtonClass}>
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {isDark ? "Light Mode" : "Dark Mode"}
        </button>

        {currentUser && (
          <>
            <NavLink to="/settings" className={sidebarLinkClass}>
              <Settings className="size-4" />
              Settings
            </NavLink>
            <Form method="post" action="/api/logout">
              <button type="submit" className={sidebarButtonClass}>
                <LogOut className="size-4" />
                Sign out
              </button>
            </Form>
            <div className="flex items-center gap-3 rounded-md px-3 py-2">
              <UserAvatar
                name={currentUser.name}
                avatarUrl={currentUser.avatarUrl}
              />
              <div className="flex-1 min-w-0">
                <div
                  title={currentUser.name}
                  className="break-words text-sm font-medium"
                >
                  {currentUser.name}
                </div>
                <div className="truncate text-xs capitalize text-sidebar-foreground/50">
                  {currentUser.role}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
