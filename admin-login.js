const adminLoginForm = document.getElementById("admin-login-form");
const adminPasswordInput = document.getElementById("admin-password");
const adminLoginStatus = document.getElementById("admin-login-status");

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminLoginStatus.textContent = "Checking password...";

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: adminPasswordInput.value
      })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Login failed");
    }

    adminLoginStatus.textContent = "Access granted. Opening admin console...";
    window.location.href = "/admin.html";
  } catch (error) {
    adminLoginStatus.textContent = `Access denied: ${error.message}`;
    adminPasswordInput.select();
  }
});
