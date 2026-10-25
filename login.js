/* login.js — tela de login (entrar, recuperar senha, definir nova senha) */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const msg = $('msg');

    function mostrar(texto, tipo) {
        msg.textContent = texto || '';
        msg.className = 'msg ' + (tipo || '');
    }

    function modo(qual) {
        $('formLogin').hidden = qual !== 'entrar';
        $('formEsqueci').hidden = qual !== 'esqueci';
        $('formNova').hidden = qual !== 'nova';
        $('titulo').textContent = { entrar: 'Login', esqueci: 'Recuperar senha', nova: 'Nova senha' }[qual];
        mostrar('');
    }

    async function iniciar() {
        if (DB.demo) $('avisoDemo').hidden = false;

        const hash = location.hash || '';
        const recuperando = /type=recovery/.test(hash);

        // Registra antes de qualquer await: o Supabase lê o link do e-mail ao iniciar.
        DB.aoRecuperarSenha(() => modo('nova'));

        if (recuperando) {
            modo('nova');
            return;
        }

        if (/error_code=otp_expired|error=access_denied/.test(hash)) {
            mostrar('Link expirado ou inválido. Peça um novo em "Esqueceu a senha?".', 'erro');
        }

        const sessao = await DB.sessao();
        if (sessao) location.replace('dashboard.html');
    }

    $('formLogin').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('btnEntrar');
        btn.disabled = true;
        mostrar('Entrando…');
        try {
            await DB.entrar($('email').value.trim(), $('senha').value, $('lembrar').checked);
            location.replace('dashboard.html');
        } catch (err) {
            mostrar(err.message, 'erro');
            btn.disabled = false;
        }
    });

    $('formEsqueci').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('btnEsqueci');
        btn.disabled = true;
        mostrar('Enviando…');
        try {
            await DB.recuperar($('emailRec').value.trim());
            mostrar('Se o e-mail estiver cadastrado, o link de redefinição já está a caminho.', 'ok');
        } catch (err) {
            mostrar(err.message, 'erro');
        }
        btn.disabled = false;
    });

    $('formNova').addEventListener('submit', async (e) => {
        e.preventDefault();
        const a = $('novaSenha').value;
        const b = $('novaSenha2').value;
        if (a.length < 8) return mostrar('Use pelo menos 8 caracteres.', 'erro');
        if (a !== b) return mostrar('As duas senhas não são iguais.', 'erro');
        const btn = $('btnNova');
        btn.disabled = true;
        try {
            await DB.novaSenha(a);
            mostrar('Senha atualizada! Entrando…', 'ok');
            setTimeout(() => location.replace('dashboard.html'), 900);
        } catch (err) {
            mostrar(err.message, 'erro');
            btn.disabled = false;
        }
    });

    $('irEsqueci').addEventListener('click', (e) => {
        e.preventDefault();
        $('emailRec').value = $('email').value;
        modo('esqueci');
    });

    $('voltar1').addEventListener('click', (e) => {
        e.preventDefault();
        modo('entrar');
    });

    iniciar();
})();
