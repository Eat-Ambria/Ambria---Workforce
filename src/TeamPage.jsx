import { useState } from "react";
import { C as C_BASE, F, LANGS } from "./constants.js";
const C = C_BASE;
import { useT } from "./ThemeContext.js";
import OrgChart from "./OrgChart.jsx";
import MembersView from "./MembersView.jsx";

export default function TeamPage({ user, lang, customMembers, setCustomMembers, removedIds, setRemovedIds, allDbUsers }) {
  const C = useT();
  const H = lang === "hi";
  const [tab, setTab] = useState("org");

  const tabs = [
    { id: "org",     i: "🏢", l: "Organisation", lH: "संगठन" },
    { id: "members", i: "👤", l: "Members",       lH: "सदस्य" },
  ];

  return (
    <div style={{ fontFamily: F.b }}>
      {/* Sub-tab switcher */}
      <div style={{
        display: "flex",
        background: C.maroonSoft,
        borderRadius: 10,
        padding: 3,
        gap: 2,
        width: "fit-content",
        marginBottom: 16,
      }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "7px 16px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontFamily: F.b,
                fontSize:12,
                fontWeight: active ? 700 : 400,
                background: active ? C.maroon : "transparent",
                color: active ? C.white : C.maroon,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {t.i} {H ? t.lH : t.l}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === "org" && (
        <OrgChart lang={lang} officeStaff={(allDbUsers||[]).filter(u=>["sales","tech","ops","hr","finance","marketing","other"].includes(u.department))} />
      )}
      {tab === "members" && (
        <MembersView
          user={user}
          lang={lang}
          customMembers={customMembers}
          setCustomMembers={setCustomMembers}
          removedIds={removedIds}
          setRemovedIds={setRemovedIds}
        />
      )}
    </div>
  );
}
