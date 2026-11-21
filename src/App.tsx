import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Users,
  FileCheck,
  Clock,
  BarChart3,
  IndianRupee,
  Award,
  PlusCircle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Search,
  Building2,
  Phone,
  GraduationCap,
} from "lucide-react";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

interface Profile {
  id: string;
  user_code: string;
  full_name: string;
  role: string;
  is_active: boolean;
  region?: string;
}

interface University {
  id: string;
  name: string;
  state: string;
}

interface Student {
  id: string;
  full_name: string;
  phone: string;
  course_branch: string;
  created_at: string;
  universities?: { name: string };
}

interface Admission {
  id: string;
  status: "Pending" | "Approved" | "Rejected";
  assigned_amount: number;
  submitted_at: string;
  students?: {
    full_name: string;
    phone: string;
    course_branch: string;
  };
  universities?: {
    name: string;
  };
}

type TabKey = "dashboard" | "students" | "admissions" | "status" | "reports";

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");

  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Login Form State
  const [userCode, setUserCode] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  // New Student Admission Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [newStudent, setNewStudent] = useState({
    full_name: "",
    phone: "",
    university_id: "",
    course_branch: "",
  });

  useEffect(() => {
    if (!supabase) {
      setAuthError(
        "Supabase keys missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel Environment Variables and redeploy."
      );
      setLoading(false);
      return;
    }

    // Hard 3-second fallback so the screen never stalls on loading
    const fallbackTimer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        clearTimeout(fallbackTimer);
        setSession(session);
        if (session) {
          loadPortalData(session.user.id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(fallbackTimer);
        setLoading(false);
      });

    return () => clearTimeout(fallbackTimer);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    setAuthError("");
    setSigningIn(true);

    const syntheticEmail = `${userCode.trim().toLowerCase()}@gtechteam.online`;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password,
    });

    if (error || !data.user) {
      setSigningIn(false);
      setAuthError("Invalid User ID or Password. Please contact G TECH Admin.");
      return;
    }

    setSession(data.session);
    await loadPortalData(data.user.id);
    setSigningIn(false);
  }

  async function loadPortalData(userId: string) {
    if (!supabase) return;

    setLoading(true);
    try {
      const [{ data: prof }, { data: adm }, { data: stu }, { data: uni }] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("id", userId).single(),
          supabase
            .from("admissions")
            .select(
              "*, students(full_name, phone, course_branch), universities(name)"
            )
            .eq("team_member_id", userId)
            .order("submitted_at", { ascending: false }),
          supabase
            .from("students")
            .select("*, universities(name)")
            .eq("team_member_id", userId)
            .order("created_at", { ascending: false }),
          supabase.from("universities").select("*").order("name"),
        ]);

      if (!prof || !prof.is_active || prof.role !== "team_member") {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setAuthError("Account inactive or unauthorized for gtechteam.online.");
        setLoading(false);
        return;
      }

      setProfile(prof);
      setAdmissions((adm as Admission[]) || []);
      setStudents((stu as Student[]) || []);
      setUniversities((uni as University[]) || []);
    } catch {
      setAuthError("Unable to load portal data. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAdmission(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !supabase) return;

    setSubmitting(true);
    setSubmitError("");

    const { data: studentRow, error: stuErr } = await supabase
      .from("students")
      .insert({
        full_name: newStudent.full_name.trim(),
        phone: newStudent.phone.trim(),
        university_id: newStudent.university_id,
        course_branch: newStudent.course_branch.trim(),
        team_member_id: profile.id,
      })
      .select()
      .single();

    if (stuErr || !studentRow) {
      setSubmitError("Unable to save student record. Please verify details.");
      setSubmitting(false);
      return;
    }

    const { error: admErr } = await supabase.from("admissions").insert({
      student_id: studentRow.id,
      team_member_id: profile.id,
      university_id: newStudent.university_id,
      status: "Pending",
      assigned_amount: 0,
    });

    if (admErr) {
      setSubmitError("Unable to create admission entry. Please try again.");
      setSubmitting(false);
      return;
    }

    setShowAddModal(false);
    setNewStudent({
      full_name: "",
      phone: "",
      university_id: "",
      course_branch: "",
    });
    await loadPortalData(profile.id);
    setSubmitting(false);
  }

  // Strictly calculate totals ONLY from Admin-Approved admissions
  const approvedAdmissions = admissions.filter((a) => a.status === "Approved");
  const totalAmount = approvedAdmissions.reduce(
    (sum, item) => sum + Number(item.assigned_amount || 0),
    0
  );
  const numberOfAdmissions = approvedAdmissions.length;

  // University-wise breakdown for "My Reports"
  const universityBreakdown = approvedAdmissions.reduce(
    (
      acc: Record<string, { name: string; count: number; amount: number }>,
      item
    ) => {
      const uniName = item.universities?.name || "University";
      if (!acc[uniName]) {
        acc[uniName] = { name: uniName, count: 0, amount: 0 };
      }
      acc[uniName].count += 1;
      acc[uniName].amount += Number(item.assigned_amount || 0);
      return acc;
    },
    {}
  );

  const filteredAdmissions = admissions.filter(
    (a) =>
      a.students?.full_name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      a.universities?.name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      a.students?.course_branch
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase())
  );

  const filteredStudents = students.filter(
    (s) =>
      s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.universities?.name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      s.course_branch?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A192F] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#D4AF37] text-[#0A192F] font-extrabold text-2xl flex items-center justify-center shadow-lg">
            GT
          </div>
          <p className="text-white font-semibold tracking-wide text-sm">
            Loading G TECH Team Portal...
          </p>
        </div>
      </div>
    );
  }

  // LOGIN SCREEN (Credentials issued by Admin only)
  if (!session || !profile) {
    return (
      <div className="min-h-screen bg-[#0A192F] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-[#D4AF37]">
          <div className="bg-[#0A192F] px-8 py-6 text-white flex items-center gap-4 border-b border-white/10">
            <div className="w-12 h-12 rounded-xl bg-[#D4AF37] text-[#0A192F] font-extrabold text-xl flex items-center justify-center shrink-0">
              GT
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-wide">
                G TECH Admissions
              </h1>
              <p className="text-xs text-[#D4AF37] font-medium">
                gtechteam.online • Team Member Portal
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="p-8 space-y-5">
            {authError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                {authError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Assigned Team User ID
              </label>
              <input
                type="text"
                required
                placeholder="e.g. GT-101"
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-medium focus:border-[#0A192F] focus:ring-2 focus:ring-[#0A192F]/10 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                placeholder="Enter Admin-Issued Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-medium focus:border-[#0A192F] focus:ring-2 focus:ring-[#0A192F]/10 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={signingIn || !supabase}
              className="w-full py-3.5 rounded-xl bg-[#0A192F] text-[#D4AF37] font-bold text-sm tracking-wide hover:bg-[#112240] transition shadow-md disabled:opacity-60"
            >
              {signingIn ? "Signing In..." : "Access Team Dashboard"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: { id: TabKey; label: string; icon: React.ElementType }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "students", label: "Student Details", icon: Users },
    { id: "admissions", label: "Admission Details", icon: FileCheck },
    { id: "status", label: "Admission Status", icon: Clock },
    { id: "reports", label: "My Reports", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-x-hidden">
      {/* DESKTOP LEFT SIDEBAR — Strictly NO Logout and NO Change Password */}
      <aside className="hidden md:flex md:w-64 bg-[#0A192F] text-white flex-col shrink-0 shadow-xl">
        <div className="p-6 border-b border-white/10 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#D4AF37] text-[#0A192F] font-extrabold text-lg flex items-center justify-center shadow">
            GT
          </div>
          <div>
            <div className="font-extrabold tracking-wide text-white text-base">
              G TECH
            </div>
            <div className="text-[11px] text-[#D4AF37] font-medium">
              gtechteam.online
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition ${
                  isActive
                    ? "bg-[#D4AF37] text-[#0A192F] font-bold shadow-sm"
                    : "text-slate-300 font-medium hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 m-4 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 space-y-1">
          <div className="flex items-center gap-1.5 text-[#D4AF37] font-bold">
            <ShieldCheck className="w-4 h-4" /> G TECH Verified
          </div>
          <p className="text-slate-400">User ID: {profile.user_code}</p>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ANDROID COMPACT HEADER (Mobile Only — No Logout / No Change Password) */}
        <header className="md:hidden bg-[#0A192F] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37] text-[#0A192F] font-extrabold flex items-center justify-center text-sm shrink-0">
              GT
            </div>
            <div className="truncate">
              <div className="font-extrabold text-sm leading-tight">
                G TECH Admissions
              </div>
              <div className="text-[11px] text-[#D4AF37] truncate">
                Welcome, {profile.full_name}
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 rounded-xl bg-[#D4AF37] text-[#0A192F] text-xs font-extrabold flex items-center gap-1.5 shrink-0 active:scale-95 transition"
          >
            <PlusCircle className="w-4 h-4" /> Add Student
          </button>
        </header>

        <main className="p-4 md:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* WELCOME BANNER */}
          <section className="gtech-banner-gradient rounded-2xl p-6 md:p-7 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg border-b-4 border-[#D4AF37]">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[#D4AF37] text-xs font-bold mb-2">
                <span>G TECH Consultancy</span>
                <span>•</span>
                <span>{profile.user_code}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Welcome, {profile.full_name}
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                Manage your student admissions and track your verified totals.
              </p>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="hidden sm:inline-flex px-5 py-3.5 rounded-xl bg-[#D4AF37] text-[#0A192F] font-extrabold text-sm items-center justify-center gap-2 hover:brightness-105 transition shadow-md shrink-0"
            >
              <PlusCircle className="w-4 h-4" /> New Admission Entry
            </button>
          </section>

          {/* SUMMARY CARDS — Displays ONLY "Total Amount" and "Number of Admissions" */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total Amount
                </p>
                <p className="text-3xl md:text-4xl font-extrabold text-[#0A192F] mt-1.5">
                  ₹{totalAmount.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-[#0A192F] text-[#D4AF37] flex items-center justify-center shadow-inner shrink-0">
                <IndianRupee className="w-7 h-7" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Number of Admissions
                </p>
                <p className="text-3xl md:text-4xl font-extrabold text-[#0A192F] mt-1.5">
                  {numberOfAdmissions}
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/20 text-[#0A192F] flex items-center justify-center shrink-0">
                <Award className="w-7 h-7" />
              </div>
            </div>
          </section>

          {/* QUICK ACCESS — STRICTLY TWO BUTTONS SIDE BY SIDE IN EACH ROW ON ANDROID MOBILE */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Quick Access
              </h2>
              {activeTab !== "dashboard" && (
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className="text-xs font-bold text-[#0A192F] underline"
                >
                  Back to Overview
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: "students", label: "Student Details", icon: Users },
                { id: "admissions", label: "Admission Details", icon: FileCheck },
                { id: "status", label: "Admission Status", icon: Clock },
                { id: "reports", label: "My Reports", icon: BarChart3 },
              ].map((btn) => {
                const Icon = btn.icon;
                const isSelected = activeTab === btn.id;
                return (
                  <button
                    key={btn.id}
                    onClick={() => setActiveTab(btn.id as TabKey)}
                    className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between min-h-[96px] active:scale-[0.98] shadow-sm ${
                      isSelected
                        ? "bg-[#0A192F] text-white border-[#0A192F]"
                        : "bg-white text-[#0A192F] border-slate-200 hover:border-[#D4AF37]"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
                        isSelected
                          ? "bg-[#D4AF37] text-[#0A192F]"
                          : "bg-slate-100 text-[#0A192F]"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-sm leading-snug">
                      {btn.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* SEARCH BAR FOR RECORDS */}
          {activeTab !== "reports" && (
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student name, course, or university..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-white border border-slate-200 text-sm focus:border-[#0A192F] outline-none shadow-sm"
              />
            </div>
          )}

          {/* VIEW 1: STUDENT DETAILS */}
          {activeTab === "students" && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-[#0A192F] text-white font-bold text-sm">
                My Student Details ({filteredStudents.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="px-6 py-3.5">Student Name</th>
                      <th className="px-6 py-3.5">Contact</th>
                      <th className="px-6 py-3.5">University Name</th>
                      <th className="px-6 py-3.5">Course / Branch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((stu) => (
                      <tr key={stu.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-bold text-[#0A192F]">
                          {stu.full_name}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {stu.phone}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700 font-medium">
                          {stu.universities?.name}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <GraduationCap className="w-3.5 h-3.5 text-[#D4AF37]" />
                            {stu.course_branch}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredStudents.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-6 py-10 text-center text-slate-400"
                        >
                          No student records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* VIEW 2: MY REPORTS (University-wise Breakdown) */}
          {activeTab === "reports" && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-[#0A192F] text-white flex items-center justify-between">
                <span className="font-bold text-sm">
                  My University-Wise Performance Report
                </span>
                <span className="text-xs text-[#D4AF37] font-semibold">
                  Total: ₹{totalAmount.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="px-6 py-3.5">University Name</th>
                      <th className="px-6 py-3.5">Admissions</th>
                      <th className="px-6 py-3.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.values(universityBreakdown).map((row) => (
                      <tr key={row.name} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-bold text-[#0A192F] flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#D4AF37]" />
                          {row.name}
                        </td>
                        <td className="px-6 py-4 font-semibold">{row.count}</td>
                        <td className="px-6 py-4 text-right font-extrabold text-[#0A192F]">
                          ₹{row.amount.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                    {Object.keys(universityBreakdown).length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-10 text-center text-slate-400"
                        >
                          No verified admissions recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* VIEW 3: DASHBOARD RECENT ACTIVITY / ADMISSION DETAILS / ADMISSION STATUS */}
          {(activeTab === "dashboard" ||
            activeTab === "admissions" ||
            activeTab === "status") && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-[#0A192F] text-sm">
                  {activeTab === "dashboard"
                    ? "Recent Activity"
                    : activeTab === "status"
                    ? "Admission Status Tracker"
                    : "Admission Details"}
                </h3>
                <span className="text-xs text-slate-500">
                  {filteredAdmissions.length} record(s)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="px-6 py-3.5">Student Name</th>
                      <th className="px-6 py-3.5">University</th>
                      <th className="px-6 py-3.5">Submission Date</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAdmissions.map((adm) => (
                      <tr key={adm.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#0A192F]">
                            {adm.students?.full_name}
                          </div>
                          <div className="text-xs text-slate-400">
                            {adm.students?.course_branch}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-700 font-medium">
                          {adm.universities?.name}
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-xs">
                          {new Date(adm.submitted_at).toLocaleDateString(
                            "en-IN",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                              adm.status === "Approved"
                                ? "bg-emerald-100 text-emerald-800"
                                : adm.status === "Rejected"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {adm.status === "Approved" && (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            {adm.status === "Rejected" && (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            {adm.status === "Pending" && (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                            {adm.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-extrabold text-[#0A192F]">
                          {adm.status === "Approved"
                            ? `₹${Number(adm.assigned_amount).toLocaleString(
                                "en-IN"
                              )}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                    {filteredAdmissions.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-10 text-center text-slate-400"
                        >
                          No admission records found. Tap "Add Student" to
                          submit one.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* NEW STUDENT ADMISSION MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-[#0A192F]/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSubmitAdmission}
            className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border-t-4 border-[#D4AF37]"
          >
            <div className="px-6 py-4 bg-[#0A192F] text-white">
              <h2 className="text-base font-extrabold">
                Submit Student Admission
              </h2>
              <p className="text-xs text-[#D4AF37]">
                G TECH Admissions • {profile.full_name}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {submitError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                  {submitError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Student Full Name
                </label>
                <input
                  required
                  placeholder="Enter full name"
                  value={newStudent.full_name}
                  onChange={(e) =>
                    setNewStudent({ ...newStudent, full_name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#0A192F] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Contact Number
                </label>
                <input
                  required
                  type="tel"
                  placeholder="Enter mobile number"
                  value={newStudent.phone}
                  onChange={(e) =>
                    setNewStudent({ ...newStudent, phone: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#0A192F] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  University Name
                </label>
                <select
                  required
                  value={newStudent.university_id}
                  onChange={(e) =>
                    setNewStudent({
                      ...newStudent,
                      university_id: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:border-[#0A192F] outline-none"
                >
                  <option value="">Select University</option>
                  {universities.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Course / Branch
                </label>
                <input
                  required
                  placeholder="e.g. B.Tech CSE - AI & DS"
                  value={newStudent.course_branch}
                  onChange={(e) =>
                    setNewStudent({
                      ...newStudent,
                      course_branch: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#0A192F] outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-[#0A192F] text-[#D4AF37] font-extrabold text-sm hover:bg-[#112240] disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : "Submit Admission"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
