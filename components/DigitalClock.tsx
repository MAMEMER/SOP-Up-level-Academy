"use client";

import { useEffect, useState } from "react";

function formatBangkokTime(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

export function DigitalClock() {
  const [timeText, setTimeText] = useState("00:00:00");

  useEffect(() => {
    const updateClock = () => setTimeText(formatBangkokTime(new Date()));
    updateClock();
    const interval = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="digital-clock" aria-label="เวลาปัจจุบัน">
      {timeText}
    </div>
  );
}
