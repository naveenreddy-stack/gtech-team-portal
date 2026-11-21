import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const supabase =
  supabaseUrl.startsWith("http") && supabaseAnonKey.length > 10
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

interface Profile {
  id: string;
  user_code: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

interface University {
  id: string;
  name: string;
}

interface Student {
  id: string;
  full_name: string;
  phone: string;
  course_branch: string;
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

  const [userCode, setUserCode] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

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
        "Supabase Environment Variables missing in Vercel. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel Settings and redeploy."
      );
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => setLoading(false), 2500);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timer);
        setSession(session);
        if (session) {
          loadPortalData(session.user.id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        setLoading(false);
      });

    return () => clearTimeout(timer);
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
      setAuthError("Invalid User ID or Password. Contact G TECH Admin.");
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
      setAuthError("Network error while loading G TECH portal.");
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
      setSubmitError("Unable to save student record. Verify all fields.");
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
      setSubmitError("Unable to submit admission entry.");
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

  const approvedAdmissions = admissions.filter((a) => a.status === "Approved");
  const totalAmount = approvedAdmissions.reduce(
    (sum, item) => sum + Number(item.assigned_amount || 0),
    0
  );
  const numberOfAdmissions = approvedAdmissions.length;

  const universityBreakdown = approvedAdmissions.reduce(
    (
      acc: Record<string, { name: string; count: number; amount: number }>,
      item
    ) => {
      const uniName = item.universities?.name || "University";
      if (!acc[uniName]) acc[uniName] = { name: uniName, count: 0, amount: 0 };
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
      a.universities?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStudents = students.filter(
    (s) =>
      s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.universities?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A192F] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#D4AF37] text-[#0A192F] font-extrabold text-2xl flex items-center justify-center shadow-lg">
            GT
          </div>
          <p className="text-white font-bold text-sm">
            Loading G TECH Team Portal...
          </p>
        </div>
      </div>
    );
  }

  // LOGIN SCREEN
  if (!session || !profile) {
    return (
      <div className="min-h-screen bg-[#0A192F] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-[#D4AF37]">
          <div className="bg-[#0A192F] px-7 py-6 text-white flex items-center gap-4 border-b border-white/10">
            <div className="w-12 h-12 rounded-xl bg-[#D4AF37] text-[#0A192F] font-extrabold text-xl flex items-center justify-center shrink-0">
              GT
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-wide">
                G TECH Admissions
              </h1>
              <p className="text-xs text-[#D4AF37] font-semibold">
                gtechteam.online • Team Member Portal
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="p-7 space-y-5">
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
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-semibold focus:border-[#0A192F] outline-none"
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
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-semibold focus:border-[#0A192F] outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={signingIn || !supabase}
              className="w-full py-3.5 rounded-xl bg-[#0A192F] text-[#D4AF37] font-extrabold text-sm tracking-wide hover:bg-[#112240] transition shadow-md disabled:opacity-50"
            >
              {signingIn ? "Signing In..." : "Access Team Dashboard"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: { id: TabKey; label: string; badge: string }[] = [
    { id: "dashboard", label: "Dashboard", badge: "01" },
    { id: "students", label: "Student Details", badge: "02" },
    { id: "admissions", label: "Admission Details", badge: "03" },
    { id: "status", label: "Admission Status", badge: "04" },
    { id: "reports", label: "My Reports", badge: "05" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-x-hidden">
      {/* DESKTOP SIDEBAR (No Logout, No Change Password) */}
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
                <span className="text-xs font-extrabold opacity-75">
                  {item.badge}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 m-4 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300">
          <div className="text-[#D4AF37] font-bold mb-1">G TECH Verified</div>
          <p className="text-slate-400">User ID: {profile.user_code}</p>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ANDROID MOBILE COMPACT HEADER */}
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
            className="px-3.5 py-2 rounded-xl bg-[#D4AF37] text-[#0A192F] text-xs font-extrabold shrink-0"
          >
            + Add Student
          </button>
        </header>

        <main className="p-4 md:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* WELCOME BANNER */}
          <section className="bg-[#0A192F] rounded-2xl p-6 md:p-7 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg border-b-4 border-[#D4AF37]">
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
              className="hidden sm:inline-flex px-5 py-3.5 rounded-xl bg-[#D4AF37] text-[#0A192F] font-extrabold text-sm items-center justify-center hover:brightness-105 transition shadow-md shrink-0"
            >
              + New Admission Entry
            </button>
          </section>

          {/* SUMMARY CARDS: "Total Amount" & "Number of Admissions" */}
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
              <div className="w-14 h-14 rounded-2xl bg-[#0A192F] text-[#D4AF37] font-extrabold text-2xl flex items-center justify-center shrink-0">
                ₹
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
              <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/20 text-[#0A192F] font-extrabold text-xl flex items-center justify-center shrink-0">
                #
              </div>
            </div>
          </section>

          {/* QUICK ACCESS — STRICTLY 2 BUTTONS SIDE BY SIDE ON ANDROID MOBILE */}
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
                { id: "students", label: "Student Details", code: "SD" },
                { id: "admissions", label: "Admission Details", code: "AD" },
                { id: "status", label: "Admission Status", code: "AS" },
                { id: "reports", label: "My Reports", code: "MR" },
              ].map((btn) => {
                const isSelected = activeTab === btn.id;
                return (
                  <button
                    key={btn.id}
                    onClick={() => setActiveTab(btn.id as TabKey)}
                    className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between min-h-[96px] shadow-sm ${
                      isSelected
                        ? "bg-[#0A192F] text-white border-[#0A192F]"
                        : "bg-white text-[#0A192F] border-slate-200 hover:border-[#D4AF37]"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl font-extrabold text-xs flex items-center justify-center mb-2 ${
                        isSelected
                          ? "bg-[#D4AF37] text-[#0A192F]"
                          : "bg-slate-100 text-[#0A192F]"
                      }`}
                    >
                      {btn.code}
                    </div>
                    <span className="font-bold text-sm leading-snug">
                      {btn.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* SEARCH BAR */}
          {activeTab !== "reports" && (
            <input
              type="text"
              placeholder="Search student name or university..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm focus:border-[#0A192F] outline-none shadow-sm"
            />
          )}

          {/* STUDENT DETAILS TABLE */}
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
                      <tr key={stu.id}>
                        <td className="px-6 py-4 font-bold text-[#0A192F]">
                          {stu.full_name}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{stu.phone}</td>
                        <td className="px-6 py-4 text-slate-700 font-medium">
                          {stu.universities?.name}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {stu.course_branch}
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

          {/* MY REPORTS TABLE */}
          {activeTab === "reports" && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-[#0A192F] text-white flex items-center justify-between">
                <span className="font-bold text-sm">
                  My University-Wise Report
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
                      <tr key={row.name}>
                        <td className="px-6 py-4 font-bold text-[#0A192F]">
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

          {/* RECENT ACTIVITY / ADMISSION DETAILS / STATUS */}
          {(activeTab === "dashboard" ||
            activeTab === "admissions" ||
            activeTab === "status") && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-[#0A192F] text-sm">
                  {activeTab === "dashboard"
                    ? "Recent Activity"
                    : activeTab === "status"
                    ? "Admission Status"
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
                      <th className="px-6 py-3.5">Date</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAdmissions.map((adm) => (
                      <tr key={adm.id}>
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
                            "en-IN"
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold ${
                              adm.status === "Approved"
                                ? "bg-emerald-100 text-emerald-800"
                                : adm.status === "Rejected"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
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
                          No admission records found.
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
        <div className="fixed inset-0 bg-[#0A192F]/75 flex items-center justify-center p-4 z-50">
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

              <input
                required
                placeholder="Student Full Name"
                value={newStudent.full_name}
                onChange={(e) =>
                  setNewStudent({ ...newStudent, full_name: e.target.value })
                }
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
              />

              <input
                required
                type="tel"
                placeholder="Contact Number"
                value={newStudent.phone}
                onChange={(e) =>
                  setNewStudent({ ...newStudent, phone: e.target.value })
                }
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
              />

              <select
                required
                value={newStudent.university_id}
                onChange={(e) =>
                  setNewStudent({
                    ...newStudent,
                    university_id: e.target.value,
                  })
                }
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="">Select University</option>
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>

              <input
                required
                placeholder="Course / Branch (e.g. CSE - AI & DS)"
                value={newStudent.course_branch}
                onChange={(e) =>
                  setNewStudent({
                    ...newStudent,
                    course_branch: e.target.value,
                  })
                }
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-[#0A192F] text-[#D4AF37] font-extrabold text-sm"
                >
                  {submitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
