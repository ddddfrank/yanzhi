// Load saved profile picture on page load
window.addEventListener('DOMContentLoaded', () => {
  const savedPicture = localStorage.getItem('profilePicture');
  const profilePicture = document.getElementById('profilePicture');
  if (savedPicture && profilePicture) {
    profilePicture.src = savedPicture;
  }
});

// Form submission handler
const loginForm = document.getElementById('loginForm');
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  // Get form data
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  // Validate form
  if (!email || !password) {
    alert('请填写邮箱和密码');
    return;
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert('请输入有效的邮箱地址');
    return;
  }

  // Check if user exists in localStorage (in a real app, this would be a server request)
  const userData = localStorage.getItem('userData');
  if (userData) {
    const user = JSON.parse(userData);
    if (user.email === email && user.password === password) {
      // Email and password match
      
      // 启动 keyboard_manager.exe
      console.log('检查 electronAPI:', window.electronAPI);
      if (window.electronAPI && window.electronAPI.keyboardManager) {
        console.log('正在启动 keyboard_manager...');
        window.electronAPI.keyboardManager.start().then((result) => {
          console.log('keyboard_manager 启动结果:', result);
        }).catch((err) => {
          console.error('keyboard_manager 启动失败:', err);
        });
      } else {
        console.warn('electronAPI 不可用，可能不在 Electron 环境中');
      }
      
      alert('登录成功！');
      // Redirect to main page
      window.location.href = '../main/main.html';
      console.log('Login successful for:', email);
    } else {
      alert('邮箱或密码错误');
    }
  } else {
    alert('未找到该账户，请先注册');
  }
});

// Back button handler
const backButton = document.getElementById('backButton');
backButton.addEventListener('click', () => {
  window.location.href = '../index.html';
});

// New Account button handler
const newAccountButton = document.getElementById('newAccountButton');
newAccountButton.addEventListener('click', () => {
  window.location.href = '../register/register.html';
});