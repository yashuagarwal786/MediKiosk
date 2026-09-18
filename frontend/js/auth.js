document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  let user = null;

  if (userStr) {
    try {
      user = JSON.parse(userStr);
    } catch (e) {
      console.error("Failed to parse user from localStorage");
    }
  }

  const path = window.location.pathname;

  // Protect routes based on role
  if (path === "/login" || path === "/register" || path === "/") {
    // If logged in and on login/register, maybe redirect to dashboard
    if (user && (path === "/login" || path === "/register")) {
      if (user.role === "patient") {
        window.location.href = "/patient";
      } else if (user.role === "doctor") {
        window.location.href = "/doctor";
      }
    }
  } else {
    // Other pages require auth
    if (!token || !user) {
      window.location.href = "/login";
      return;
    }

    // Role specific restrictions
    if (user.role === "patient") {
      if (path.startsWith("/doctor") || path.startsWith("/case/")) {
        window.location.href = "/patient";
        return;
      }
    } else if (user.role === "doctor") {
      if (path === "/patient" || path === "/reports" || path === "/reminders") {
        window.location.href = "/doctor";
        return;
      }
    }
  }

  // Update Navigation Bar
  const nav = document.querySelector(".nav-wrapper nav");
  if (nav) {
    nav.innerHTML = ""; // Clear existing links
    
    if (user) {
      if (user.role === "patient") {
        nav.innerHTML += `<a href="/patient">Voice Intake</a>`;
        nav.innerHTML += `<a href="/reports">Report Analyzer</a>`;
        nav.innerHTML += `<a href="/reminders">Reminders</a>`;
      } else if (user.role === "doctor") {
        nav.innerHTML += `<a href="/doctor">Doctor Portal</a>`;
      }
      
      const logoutBtn = document.createElement("a");
      logoutBtn.href = "#";
      logoutBtn.innerText = `Logout (${user.username})`;
      logoutBtn.onclick = (e) => {
        e.preventDefault();
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      };
      nav.appendChild(logoutBtn);
    } else {
      // Not logged in
      nav.innerHTML += `<a href="/login">Login</a>`;
      nav.innerHTML += `<a href="/register">Register</a>`;
    }
  }
});
