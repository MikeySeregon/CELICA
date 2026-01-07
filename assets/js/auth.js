import { supabase } from './supabase.js'

const form = document.getElementById('login-form')
const errorText = document.getElementById('error')

if (form) {
  form.addEventListener('submit', async (e) => {
	e.preventDefault()

	const email = document.getElementById('email').value
	const password = document.getElementById('password').value

	const { error } = await supabase.auth.signInWithPassword({
	  email,
	  password
	})

	if (error) {
	  errorText.textContent = error.message
	  return
	}

	window.location.href = 'dashboard.html'
  })
}
