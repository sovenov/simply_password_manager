(function ($) {
    'use strict';

    var users = [];
    var currentAdmin = null;
    var csrfToken = '';
    var KDF_ITERATIONS = 210000;

    function resolved(value) {
        return $.Deferred().resolve(value).promise();
    }

    function rejected(error) {
        return $.Deferred().reject(error).promise();
    }

    function fromNativePromise(promise) {
        var deferred = $.Deferred();
        promise.then(function (value) {
            deferred.resolve(value);
        }, function (error) {
            deferred.reject(error);
        });
        return deferred.promise();
    }

    function getSubtleCrypto() {
        return window.crypto && (window.crypto.subtle || window.crypto.webkitSubtle);
    }

    function utf8ToBytes(text) {
        var binary = unescape(encodeURIComponent(text));
        var bytes = new Uint8Array(binary.length);
        var i;
        for (i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function bufferToBase64(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        var i;
        for (i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function base64ToBuffer(base64) {
        var binary = atob(base64);
        var bytes = new Uint8Array(binary.length);
        var i;
        for (i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function randomBytes(length) {
        var cryptoObject = window.crypto || window.msCrypto;
        if (!cryptoObject || !cryptoObject.getRandomValues) {
            return null;
        }
        return cryptoObject.getRandomValues(new Uint8Array(length));
    }

    function getCryptoKey(password, meta) {
        var subtle = getSubtleCrypto();
        if (!subtle || !subtle.importKey || !subtle.deriveKey) {
            return rejected(new Error('PBKDF2 недоступен в этом браузере.'));
        }

        return fromNativePromise(subtle.importKey('raw', utf8ToBytes(password), { name: 'PBKDF2' }, false, ['deriveKey'])).then(function (baseKey) {
            return fromNativePromise(subtle.deriveKey({
                name: 'PBKDF2',
                salt: base64ToBuffer(meta.kdf_salt),
                iterations: parseInt(meta.kdf_iterations, 10),
                hash: { name: 'SHA-256' }
            }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
        });
    }

    function encryptText(text, key) {
        var subtle = getSubtleCrypto();
        var iv;
        var salt;
        var meta;
        if (!subtle || !window.crypto || !window.crypto.getRandomValues) {
            return rejected(new Error('AES-GCM недоступен.'));
        }
        iv = window.crypto.getRandomValues(new Uint8Array(12));
        salt = randomBytes(32);
        if (!salt) {
            return rejected(new Error('crypto.getRandomValues недоступен.'));
        }
        meta = { kdf_iterations: KDF_ITERATIONS, kdf_salt: bufferToBase64(salt) };
        return getCryptoKey(key, meta).then(function (cryptoKey) {
            return fromNativePromise(subtle.encrypt({ name: 'AES-GCM', iv: iv }, cryptoKey, utf8ToBytes(text)));
        }).then(function (ciphertext) {
            return {
                ciphertext: bufferToBase64(ciphertext),
                iv: bufferToBase64(iv),
                kdf_iterations: meta.kdf_iterations,
                kdf_salt: meta.kdf_salt
            };
        });
    }

    function escapeHTML(value) {
        return String(value || '').replace(/[&<>'"]/g, function (tag) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag];
        });
    }

    function apiCall(payload) {
        if (csrfToken && !payload.csrf) {
            payload.csrf = csrfToken;
        }
        return $.ajax({
            url: '../api.php',
            type: 'POST',
            data: JSON.stringify(payload),
            contentType: 'application/json',
            dataType: 'json'
        });
    }

    function ajaxMessage(xhr) {
        var response = xhr && xhr.responseJSON;
        if (response && response.error) {
            return response.error;
        }
        return 'Ошибка запроса.';
    }

    function setMessage(text, isError) {
        $('#adminMessage').text(text || '').toggleClass('error', !!isError);
    }

    function userById(id) {
        var i;
        for (i = 0; i < users.length; i += 1) {
            if (parseInt(users[i].id, 10) === id) {
                return users[i];
            }
        }
        return null;
    }

    function userLogin(user) {
        if (user.login) {
            return user.login;
        }

        return user.is_owner ? 'admin' : '';
    }

    function canDeleteUser(user) {
        if (!currentAdmin || !user) {
            return false;
        }

        if (user.is_owner || parseInt(user.id, 10) === parseInt(currentAdmin.id, 10)) {
            return false;
        }

        if (user.is_admin && !currentAdmin.is_owner) {
            return false;
        }

        return true;
    }

    function renderUsers() {
        var html = '';
        var i;
        var user;
        var login;
        var canTurnOffAdmin;
        var adminDisabled;
        var canDelete;

        for (i = 0; i < users.length; i += 1) {
            user = users[i];
            login = userLogin(user);
            canTurnOffAdmin = currentAdmin && currentAdmin.is_owner;
            adminDisabled = user.is_owner || (user.is_admin && !canTurnOffAdmin);
            canDelete = canDeleteUser(user);

            html += '<div class="panel admin-user" data-id="' + user.id + '">';
            html += '<div class="admin-user-title">ID ' + user.id + (login ? ' - ' + escapeHTML(login) : ' - логин не сохранён') + (user.is_owner ? ' - главный админ' : '') + '</div>';
            html += '<label>Логин</label>';
            html += '<input type="text" class="js-user-login" value="' + escapeHTML(login) + '" placeholder="Введите логин" autocomplete="off" autocapitalize="none" spellcheck="false">';
            html += '<label class="checkbox-container admin-check"><input type="checkbox" class="js-user-approved"' + (user.is_approved ? ' checked' : '') + '><span class="checkmark"></span><span>Подтверждён</span></label>';
            html += '<label class="checkbox-container admin-check"><input type="checkbox" class="js-user-admin"' + (user.is_admin ? ' checked' : '') + (adminDisabled ? ' disabled' : '') + '><span class="checkmark"></span><span>Админ</span></label>';
            html += '<label>Ключ шифрования для изменения логина или пароля</label>';
            html += '<input type="password" class="js-user-key" autocomplete="off" autocapitalize="none" spellcheck="false">';
            html += '<div class="admin-actions">';
            if (!user.is_approved) {
                html += '<button type="button" class="secondary js-approve-user">Подтвердить</button>';
            }
            html += '<button type="button" class="secondary js-save-user">Сохранить</button>';
            if (canDelete) {
                html += '<button type="button" class="delete-btn js-delete-user">Удалить</button>';
            } else {
                html += '<button type="button" class="delete-btn" disabled>Удалить нельзя</button>';
            }
            html += '</div>';
            if (canDelete) {
                html += '<div class="admin-delete-confirm">';
                html += '<span>Удалить эту учётку?</span>';
                html += '<button type="button" class="delete-btn js-confirm-delete-user">Да</button>';
                html += '<button type="button" class="secondary js-cancel-delete-user">Отмена</button>';
                html += '</div>';
            }
            html += '<div class="admin-reset">';
            html += '<label>Новый пароль</label>';
            html += '<input type="password" class="js-new-password" autocomplete="new-password">';
            html += '<button type="button" class="secondary js-reset-password">Сбросить пароль</button>';
            html += '</div>';
            html += '<div class="admin-user-message"></div>';
            html += '</div>';
        }

        $('#usersList').html(html || '<div class="panel">Учёток нет.</div>');
    }

    function loadUsers() {
        return $.getJSON('../api.php?action=admin_users').then(function (data) {
            users = data.users || [];
            currentAdmin = data.current_user || null;
            csrfToken = data.csrf || '';
            renderUsers();
        }, function (xhr) {
            if (xhr.status === 401 || xhr.status === 403) {
                window.location.replace('../index.php');
                return;
            }
            setMessage('Ошибка загрузки пользователей.', true);
        });
    }

    function saveUser($panel) {
        var id = parseInt($panel.attr('data-id'), 10);
        var user = userById(id);
        var login = $panel.find('.js-user-login').val();
        var key = $panel.find('.js-user-key').val();
        var isApproved = $panel.find('.js-user-approved').prop('checked');
        var isAdmin = $panel.find('.js-user-admin').prop('checked');
        var $message = $panel.find('.admin-user-message');
        var loginChanged;
        var payload;

        if (!user || !login) {
            $message.text('Введите логин.').addClass('error');
            return;
        }

        if (user.is_owner) {
            isAdmin = true;
        }

        $message.text('').removeClass('error');
        loginChanged = login !== userLogin(user);
        payload = {
            action: 'admin_update_user',
            id: id,
            login: login,
            is_admin: isAdmin ? 1 : 0,
            is_approved: isApproved ? 1 : 0
        };

        if (!loginChanged) {
            apiCall(payload).then(function () {
                $message.text('Сохранено.').removeClass('error');
                return loadUsers();
            }, function (xhr) {
                $message.text(ajaxMessage(xhr)).addClass('error');
            });
            return;
        }

        if (!key) {
            $message.text('Для изменения логина введите ключ шифрования.').addClass('error');
            return;
        }

        $.when(encryptText(JSON.stringify({ login: login }), key), encryptText(login, key)).then(function (authPayload, loginEncrypted) {
            payload.auth_key = key;
            payload.auth_payload = authPayload;
            payload.login_encrypted = loginEncrypted;
            return apiCall(payload);
        }).then(function () {
            $panel.find('.js-user-key').val('');
            $message.text('Сохранено.').removeClass('error');
            return loadUsers();
        }, function (xhr) {
            $message.text(xhr && xhr.message ? xhr.message : ajaxMessage(xhr)).addClass('error');
        });
    }

    function resetPassword($panel) {
        var id = parseInt($panel.attr('data-id'), 10);
        var key = $panel.find('.js-user-key').val();
        var password = $panel.find('.js-new-password').val();
        var $message = $panel.find('.admin-user-message');

        if (!password || !key) {
            $message.text('Введите новый пароль и ключ шифрования.').addClass('error');
            return;
        }

        $.when(encryptText(JSON.stringify({ password: password }), key), encryptText(password, key)).then(function (authPayload, passwordEncrypted) {
            return apiCall({
                action: 'admin_reset_password',
                id: id,
                auth_key: key,
                auth_payload: authPayload,
                password_encrypted: passwordEncrypted
            });
        }).then(function () {
            $panel.find('.js-new-password').val('');
            $panel.find('.js-user-key').val('');
            $message.text('Пароль сброшен. Активные сессии пользователя завершены.').removeClass('error');
        }, function (xhr) {
            $message.text(xhr && xhr.message ? xhr.message : ajaxMessage(xhr)).addClass('error');
        });
    }

    $(function () {
        loadUsers();
        $('#usersList').on('click', '.js-approve-user', function () {
            var $panel = $(this).closest('.admin-user');
            apiCall({ action: 'admin_approve_user', id: parseInt($panel.attr('data-id'), 10) }).then(loadUsers);
        });
        $('#usersList').on('click', '.js-delete-user', function () {
            var $panel = $(this).closest('.admin-user');
            $panel.addClass('confirm-delete');
            $panel.find('.admin-user-message').text('').removeClass('error');
        });
        $('#usersList').on('click', '.js-cancel-delete-user', function () {
            $(this).closest('.admin-user').removeClass('confirm-delete');
        });
        $('#usersList').on('click', '.js-confirm-delete-user', function () {
            var $panel = $(this).closest('.admin-user');
            apiCall({ action: 'admin_delete_user', id: parseInt($panel.attr('data-id'), 10) }).then(loadUsers, function (xhr) {
                $panel.find('.admin-user-message').text(ajaxMessage(xhr)).addClass('error');
            });
        });
        $('#usersList').on('click', '.js-save-user', function () {
            saveUser($(this).closest('.admin-user'));
        });
        $('#usersList').on('click', '.js-reset-password', function () {
            resetPassword($(this).closest('.admin-user'));
        });
    });
}(jQuery));
