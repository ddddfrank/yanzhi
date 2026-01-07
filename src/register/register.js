// Profile Picture Upload
const profilePicture = document.getElementById('profilePicture');
const uploadButton = document.getElementById('uploadButton');
const deleteButton = document.getElementById('deleteButton');
const fileInput = document.getElementById('fileInput');

// Upload button click handler
uploadButton.addEventListener('click', () => {
  fileInput.click();
});

// File input change handler
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        profilePicture.src = event.target.result;
        // Store the image data in localStorage for persistence
        localStorage.setItem('profilePicture', event.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      alert('请选择图片文件');
    }
  }
});

// Delete button click handler
deleteButton.addEventListener('click', () => {
  if (confirm('确定要删除头像吗？')) {
    profilePicture.src = 'https://via.placeholder.com/120/cccccc/666666?text=头像';
    localStorage.removeItem('profilePicture');
    fileInput.value = '';
  }
});

// Load saved profile picture on page load
window.addEventListener('DOMContentLoaded', () => {
  const savedPicture = localStorage.getItem('profilePicture');
  if (savedPicture) {
    profilePicture.src = savedPicture;
  }
});

// Form submission handler
const registerForm = document.getElementById('registerForm');
registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  // Get form data
  const formData = {
    username: document.getElementById('username').value,
    identity: document.getElementById('identity').value,
    field: document.getElementById('field').value,
    birthday: document.getElementById('birthday').value,
    email: document.getElementById('email').value,
    password: document.getElementById('password').value,
    profilePicture: profilePicture.src
  };

  // Validate form
  if (!formData.username || !formData.identity || !formData.field || 
      !formData.birthday || !formData.email || !formData.password) {
    alert('请填写所有必填字段');
    return;
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(formData.email)) {
    alert('请输入有效的邮箱地址');
    return;
  }

  // Password validation
  if (formData.password.length < 6) {
    alert('密码长度不能少于6位');
    return;
  }

  // Save to localStorage (in a real app, this would be sent to a server)
  localStorage.setItem('userData', JSON.stringify(formData));
  
  // Show success message
  alert('注册成功！');
  
  // Redirect to main page
  window.location.href = '../main/main.html';
  console.log('Registration data:', formData);
});

// Back button handler
const backButton = document.getElementById('backButton');
backButton.addEventListener('click', () => {
  window.location.href = '../index.html';
});

// Cancel button handler
const cancelButton = document.getElementById('cancelButton');
cancelButton.addEventListener('click', () => {
  if (confirm('确定要取消注册吗？未保存的数据将丢失。')) {
    window.location.href = '../index.html';
  }
});

// Date input formatting (for better UX)
const birthdayInput = document.getElementById('birthday');
const today = new Date();
const maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()); // At least 13 years old
const minDate = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate()); // Max 100 years old

birthdayInput.setAttribute('max', maxDate.toISOString().split('T')[0]);
birthdayInput.setAttribute('min', minDate.toISOString().split('T')[0]);

