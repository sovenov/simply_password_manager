if (typeof self !== 'undefined' && typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope) {
    'use strict';

    var CACHE_NAME = 'simply-pass-shell-v30';
    var APP_SHELL = [
        './',
        './index.php',
        './styles.css',
        './html5-qrcode.min.js',
        './jquery-3.7.1.min.js',
        './Sortable.min.js'
    ];

    function sameOrigin(url) {
        return url.origin === self.location.origin;
    }

    function shellCacheKey(url) {
        var path = url.pathname;
        var scopePath = new URL(self.registration.scope).pathname;
        var relativePath;

        if (path.indexOf(scopePath) !== 0) {
            return null;
        }

        relativePath = path.substring(scopePath.length);

        if (relativePath === '') {
            return './index.php';
        }

        if (relativePath === 'index.php' || relativePath === 'index.html') {
            return './index.php';
        }

        if (relativePath === 'styles.css') {
            return './styles.css';
        }

        if (relativePath === 'app.js') {
            return './app.js';
        }

        if (relativePath === 'jquery-3.7.1.min.js') {
            return './jquery-3.7.1.min.js';
        }

        if (relativePath === 'Sortable.min.js') {
            return './Sortable.min.js';
        }

        if (relativePath === 'html5-qrcode.min.js') {
            return './html5-qrcode.min.js';
        }

        return null;
    }

    function networkFirst(request, cacheKey) {
        return fetch(request).then(function (response) {
            var responseForCache;

            if (response && response.ok) {
                responseForCache = response.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(cacheKey, responseForCache);
                });
            }

            return response;
        })['catch'](function () {
            return caches.match(cacheKey);
        });
    }

    self.addEventListener('install', function (event) {
        event.waitUntil(
            caches.open(CACHE_NAME).then(function (cache) {
                return cache.addAll(APP_SHELL).then(function () {
                    return fetch(self.location.href).then(function (response) {
                        if (response && response.ok) {
                            return cache.put('./app.js', response.clone());
                        }
                    });
                });
            }).then(function () {
                return self.skipWaiting();
            })
        );
    });

    self.addEventListener('activate', function (event) {
        event.waitUntil(
            caches.keys().then(function (names) {
                var deletions = [];
                var i;

                for (i = 0; i < names.length; i += 1) {
                    if (names[i] !== CACHE_NAME) {
                        deletions.push(caches['delete'](names[i]));
                    }
                }

                return Promise.all(deletions);
            }).then(function () {
                return self.clients.claim();
            })
        );
    });

    self.addEventListener('fetch', function (event) {
        var request = event.request;
        var url = new URL(request.url);
        var cacheKey;

        if (request.method !== 'GET' || !sameOrigin(url)) {
            return;
        }

        if (url.pathname.substring(url.pathname.lastIndexOf('/') + 1) === 'api.php') {
            return;
        }

        cacheKey = shellCacheKey(url);

        if (!cacheKey) {
            return;
        }

        if (request.mode === 'navigate') {
            event.respondWith(
                fetch(request).then(function (response) {
                    var responseForCache;

                    if (response && response.ok) {
                        responseForCache = response.clone();
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put('./index.php', responseForCache);
                        });
                    }

                    return response;
                })['catch'](function () {
                    return caches.match('./index.php');
                })
            );
            return;
        }

        event.respondWith(networkFirst(request, cacheKey));
    });
} else {
(function ($) {
    'use strict';

    var dbPasswords = [];
    var dbGroups = [];
    var decryptedDataCache = [];
    var decryptedGroupsCache = [];
    var activeGroupId = null;
    var inlineEditId = null;
    var currentUser = null;
    var authMode = 'login';
    var csrfToken = '';
    var LS_SECRET_KEY = (function () {
        var meta = document.querySelector('meta[name="spm-ls-secret"]');
        return meta && meta.getAttribute('content') ? meta.getAttribute('content') : '';
    }());
    var LS_DATA_KEY = 'pw_mgr_saved_key';
    var LS_TOGGLE_KEY = 'pw_mgr_remember';
    var LS_HIDE_PASSWORDS_KEY = 'pw_mgr_hide_passwords';
    var LS_HIDE_USERNAMES_KEY = 'pw_mgr_hide_usernames';
    var LS_HIDE_NOTES_KEY = 'pw_mgr_hide_notes';
    var LS_HIDE_OTP_KEY = 'pw_mgr_hide_otp';
    var LS_MOBILE_SEARCH_PINNED_KEY = 'pw_mgr_mobile_search_pinned';
    var LS_DARK_THEME_KEY = 'pw_mgr_dark_theme';
    var LS_STORE_LOCAL_DATA_KEY = 'pw_mgr_store_local_data';
    var LS_LOCAL_DATA_KEY = 'pw_mgr_local_encrypted_data_clean';
    var LS_LAST_USER_KEY = 'pw_mgr_last_user';
    var LS_INTEGRITY_PREFIX = 'pw_mgr_asset_sha256_';
    var LS_DEBUG_KEY = 'pw_mgr_debug';
    var KDF_ITERATIONS = 210000;
    var KDF_SALT_BYTES = 32;
    var localDataCacheLoaded = false;
    var localDataRenderPromise = null;
    var masterKeyChangeVersion = 0;
    var renderRequestVersion = 0;
    var debugEnabled = false;
    var debugSequence = 0;
    var debugKeyAliases = {};
    var debugKeyCounter = 0;
    var masterKeyInputTimer = null;
    var lastMasterKeyInputValue = '';
    var importSelectedFile = null;
    var otpUpdateTimer = null;
    var otpCameraScanner = null;
    var otpCameraTargetField = null;
    var otpCameraTargetMessage = null;
    var html5QrcodeLoadPromise = null;
    var pendingIntegrityHashes = {};
    var HTML5_QRCODE_SRI = 'sha384-c9d8RFSL+u3exBOJ4Yp3HUJXS4znl9f+z66d1y54ig+ea249SpqR+w1wyvXz/lk+';
    var PASSWORD_CHARSETS = {
        upper: { label: 'A-Z', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
        lower: { label: 'a-z', chars: 'abcdefghijklmnopqrstuvwxyz' },
        digits: { label: '0-9', chars: '0123456789' },
        symbols: { label: '!@#$%^&*()_+"№;:?/|\\\'][~`<>', chars: '!@#$%^&*()_+"№;:?/|\\\'][~`<>' }
    };

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

    function base64FromBytes(bytes) {
        var binary = '';
        var chunkSize = 8192;
        var i;
        var chunk;

        for (i = 0; i < bytes.length; i += chunkSize) {
            chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }

        return btoa(binary);
    }

    function arrayBufferFromUrl(url) {
        var deferred = $.Deferred();
        var xhr = new XMLHttpRequest();

        try {
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) {
                    return;
                }

                if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
                    deferred.resolve(xhr.response);
                    return;
                }

                deferred.reject(new Error('Не удалось проверить файл: ' + url));
            };
            xhr.onerror = function () {
                deferred.reject(new Error('Не удалось проверить файл: ' + url));
            };
            xhr.send();
        } catch (error) {
            deferred.reject(error);
        }

        return deferred.promise();
    }

    function sha256Asset(url) {
        var subtle = getSubtleCrypto();

        if (!subtle) {
            return rejected(new Error('WebCrypto недоступен.'));
        }

        return arrayBufferFromUrl(url).then(function (buffer) {
            return fromNativePromise(subtle.digest({ name: 'SHA-256' }, buffer));
        }).then(function (hashBuffer) {
            return base64FromBytes(new Uint8Array(hashBuffer));
        });
    }

    function integrityKey(name) {
        return LS_INTEGRITY_PREFIX + name;
    }

    function showIntegrityWarning(names) {
        if (window.console && window.console.log) {
            window.console.log('[SPM integrity] Изменились локальные файлы приложения: ' + names.join(', '));
        }
        acceptPendingIntegrityHashes();
    }

    function acceptPendingIntegrityHashes() {
        var name;

        for (name in pendingIntegrityHashes) {
            if (Object.prototype.hasOwnProperty.call(pendingIntegrityHashes, name)) {
                try {
                    localStorage.setItem(integrityKey(name), pendingIntegrityHashes[name]);
                } catch (ignore) {}
            }
        }

        pendingIntegrityHashes = {};
    }

    function checkAssetIntegrity(name, url) {
        var key = integrityKey(name);
        var trustedHash;

        try {
            trustedHash = localStorage.getItem(key);
        } catch (ignore) {
            trustedHash = null;
        }

        return sha256Asset(url).then(function (hash) {
            if (!trustedHash) {
                try {
                    localStorage.setItem(key, hash);
                } catch (ignore) {}
                return null;
            }

            if (trustedHash !== hash) {
                pendingIntegrityHashes[name] = hash;
                return name;
            }

            return null;
        }, function () {
            return null;
        });
    }

    function checkLocalAssetIntegrity() {
        var subtle = getSubtleCrypto();
        var appSrc = 'app.js';
        var stylesHref = 'styles.css';
        var scripts;
        var links;
        var checks = [];
        var i;
        var changed = [];

        if (!subtle || !window.XMLHttpRequest || !window.localStorage) {
            return;
        }

        scripts = document.getElementsByTagName('script');
        for (i = 0; i < scripts.length; i += 1) {
            if ((scripts[i].getAttribute('src') || '').indexOf('app.js') !== -1) {
                appSrc = scripts[i].getAttribute('src');
                break;
            }
        }

        links = document.getElementsByTagName('link');
        for (i = 0; i < links.length; i += 1) {
            if ((links[i].getAttribute('href') || '').indexOf('styles.css') !== -1) {
                stylesHref = links[i].getAttribute('href');
                break;
            }
        }

        checks.push(checkAssetIntegrity('app.js', appSrc));
        checks.push(checkAssetIntegrity('styles.css', stylesHref));
        checks.push(checkAssetIntegrity('jquery-3.7.1.min.js', 'jquery-3.7.1.min.js'));
        checks.push(checkAssetIntegrity('Sortable.min.js', 'Sortable.min.js'));

        sha256Asset(appSrc).then(function (hash) {
            if (window.console && window.console.log) {
                window.console.log('[SPM build] ' + hash.substring(0, 10));
            }
        });

        $.when.apply($, checks).done(function () {
            var args = Array.prototype.slice.call(arguments);
            var i;

            for (i = 0; i < args.length; i += 1) {
                if (args[i]) {
                    changed.push(args[i]);
                }
            }

            if (changed.length) {
                showIntegrityWarning(changed);
            }
        });
    }

    function getSubtleCrypto() {
        return window.crypto && (window.crypto.subtle || window.crypto.webkitSubtle);
    }

    function logError(message, error) {
        if (window.console && window.console.error) {
            window.console.error(message, error);
        }
    }

    function initDebugMode() {
        var search = window.location && window.location.search ? window.location.search : '';

        try {
            if (/(^|[?&])debug=1(&|$)/.test(search)) {
                localStorage.setItem(LS_DEBUG_KEY, '1');
            } else if (/(^|[?&])debug=0(&|$)/.test(search)) {
                localStorage.removeItem(LS_DEBUG_KEY);
            }

            debugEnabled = localStorage.getItem(LS_DEBUG_KEY) === '1';
        } catch (ignore) {
            debugEnabled = /(^|[?&])debug=1(&|$)/.test(search);
        }

        if (debugEnabled) {
            debugLog('debug.enabled', {
                appUrl: window.location.pathname,
                appJs: currentAppScriptSrc()
            });
        }
    }

    function currentAppScriptSrc() {
        var scripts = document.getElementsByTagName('script');
        var src;
        var i;

        for (i = 0; i < scripts.length; i += 1) {
            src = scripts[i].getAttribute('src') || '';
            if (src.indexOf('app.js') !== -1) {
                return src;
            }
        }

        return 'app.js';
    }

    function debugLog(eventName, payload) {
        if (!debugEnabled || !window.console || !window.console.log) {
            return;
        }

        debugSequence += 1;
        window.console.log('[SPM debug #' + debugSequence + '] ' + eventName, payload || {});
    }

    function debugErrorText(error) {
        if (!error) {
            return '';
        }

        return String(error.message || error.name || error);
    }

    function debugKeyLabel(value) {
        var key = String(value || '');
        var mapKey;

        if (!key) {
            return 'empty';
        }

        if (key === LS_SECRET_KEY) {
            return 'local-storage-wrapper(len=' + key.length + ')';
        }

        mapKey = 'k:' + key;
        if (!debugKeyAliases[mapKey]) {
            debugKeyCounter += 1;
            debugKeyAliases[mapKey] = 'key#' + debugKeyCounter + '(len=' + key.length + ')';
        }

        return debugKeyAliases[mapKey];
    }

    function debugShort(value) {
        value = String(value || '');
        if (!value) {
            return '';
        }

        return value.substring(0, 10) + (value.length > 10 ? '...' : '');
    }

    function debugRecordMeta(record) {
        if (!record) {
            return null;
        }

        return {
            id: typeof record.id === 'undefined' ? null : record.id,
            groupId: typeof record.group_id === 'undefined' ? null : record.group_id,
            iterations: record.kdf_iterations || null,
            saltLen: record.kdf_salt ? String(record.kdf_salt).length : 0,
            saltHead: debugShort(record.kdf_salt),
            ivLen: record.iv ? String(record.iv).length : 0,
            ivHead: debugShort(record.iv),
            ciphertextLen: record.ciphertext ? String(record.ciphertext).length : 0
        };
    }

    function debugApiPayload(payload) {
        if (!payload) {
            return null;
        }

        return {
            action: payload.action || null,
            id: typeof payload.id === 'undefined' ? null : payload.id,
            groupId: typeof payload.group_id === 'undefined' ? null : payload.group_id,
            encrypted: !!payload.ciphertext,
            meta: debugRecordMeta(payload)
        };
    }

    function debugApiResponse(response) {
        if (!response) {
            return null;
        }

        return {
            status: response.status || null,
            hasGroup: !!response.group,
            group: response.group ? debugRecordMeta(response.group) : null,
            hasPassword: !!response.password,
            password: response.password ? debugRecordMeta(response.password) : null,
            passwordCount: response.passwords ? response.passwords.length : null,
            groupCount: response.groups ? response.groups.length : null
        };
    }

    function countDecryptedItems(items) {
        var count = 0;
        var i;

        for (i = 0; i < items.length; i += 1) {
            if (items[i] && items[i].isDecrypted) {
                count += 1;
            }
        }

        return count;
    }

    function registerServiceWorker() {
        var scriptUrl = 'app.js';
        var scripts;
        var src;
        var i;

        if (!('serviceWorker' in navigator)) {
            debugLog('service-worker.skip.no-support');
            return;
        }

        scripts = document.getElementsByTagName('script');
        for (i = 0; i < scripts.length; i += 1) {
            src = scripts[i].getAttribute('src') || '';
            if (src.indexOf('app.js') !== -1) {
                scriptUrl = src;
                break;
            }
        }

        debugLog('service-worker.register.start', {
            scriptUrl: scriptUrl
        });

        navigator.serviceWorker.register(scriptUrl, { scope: './' }).then(function (registration) {
            debugLog('service-worker.register.done', {
                scope: registration && registration.scope,
                hasUpdate: !!(registration && registration.update)
            });

            if (registration && registration.update) {
                registration.update();
            }
        }, function (error) {
            debugLog('service-worker.register.fail', {
                error: debugErrorText(error)
            });
            logError('Ошибка регистрации service worker', error);
        });
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

    function bytesToUtf8(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        var i;

        for (i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }

        return decodeURIComponent(escape(binary));
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

    function clearDerivedKeyCache() {
    }

    function cryptoMetaFromRecord(record) {
        var iterations = record && record.kdf_iterations ? parseInt(record.kdf_iterations, 10) : 0;
        var salt = record && record.kdf_salt ? String(record.kdf_salt) : '';

        if (iterations > 0 && salt) {
            return {
                iterations: iterations,
                salt: salt
            };
        }

        return null;
    }

    function getCryptoKey(password, meta) {
        var subtle = getSubtleCrypto();
        var normalizedMeta = cryptoMetaFromRecord(meta);

        if (!subtle || !subtle.importKey || !subtle.deriveKey) {
            return rejected(new Error('PBKDF2 недоступен в этом браузере.'));
        }

        if (!normalizedMeta) {
            return rejected(new Error('Данные не содержат параметры PBKDF2.'));
        }

        debugLog('crypto.derive.start', {
            key: debugKeyLabel(password),
            iterations: normalizedMeta.iterations,
            saltLen: normalizedMeta.salt.length,
            saltHead: debugShort(normalizedMeta.salt)
        });

        return fromNativePromise(subtle.importKey('raw', utf8ToBytes(password), { name: 'PBKDF2' }, false, ['deriveKey'])).then(function (baseKey) {
            return fromNativePromise(subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: base64ToBuffer(normalizedMeta.salt),
                    iterations: normalizedMeta.iterations,
                    hash: { name: 'SHA-256' }
                },
                baseKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            ));
        }).then(function (key) {
            debugLog('crypto.derive.done', {
                key: debugKeyLabel(password),
                iterations: normalizedMeta.iterations,
                saltHead: debugShort(normalizedMeta.salt)
            });

            return key;
        }, function (error) {
            debugLog('crypto.derive.fail', {
                key: debugKeyLabel(password),
                iterations: normalizedMeta.iterations,
                saltHead: debugShort(normalizedMeta.salt),
                error: debugErrorText(error)
            });

            return rejected(error);
        });
    }

    function encryptData(text, password) {
        var subtle = getSubtleCrypto();
        var iv;
        var saltBytes;
        var meta;

        if (!subtle || !window.crypto || !window.crypto.getRandomValues) {
            return rejected(new Error('AES-GCM недоступен в этом браузере.'));
        }

        iv = window.crypto.getRandomValues(new Uint8Array(12));
        saltBytes = randomBytes(KDF_SALT_BYTES);

        if (!saltBytes) {
            return rejected(new Error('crypto.getRandomValues недоступен в этом браузере.'));
        }

        meta = {
            kdf_iterations: KDF_ITERATIONS,
            kdf_salt: bufferToBase64(saltBytes)
        };

        debugLog('encrypt.start', {
            key: debugKeyLabel(password),
            textLen: String(text || '').length,
            meta: debugRecordMeta({
                iv: bufferToBase64(iv),
                kdf_iterations: meta.kdf_iterations,
                kdf_salt: meta.kdf_salt
            })
        });

        return getCryptoKey(password, meta).then(function (key) {
            return fromNativePromise(subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, utf8ToBytes(text)));
        }).then(function (ciphertext) {
            var encrypted = {
                iv: bufferToBase64(iv),
                ciphertext: bufferToBase64(ciphertext),
                kdf_iterations: meta.kdf_iterations,
                kdf_salt: meta.kdf_salt
            };

            debugLog('encrypt.done', {
                key: debugKeyLabel(password),
                meta: debugRecordMeta(encrypted)
            });

            return encrypted;
        }, function (error) {
            debugLog('encrypt.fail', {
                key: debugKeyLabel(password),
                error: debugErrorText(error)
            });

            return rejected(error);
        });
    }

    function decryptData(ciphertextBase64, ivBase64, password, meta) {
        var subtle = getSubtleCrypto();
        var recordMeta = {
            ciphertext: ciphertextBase64,
            iv: ivBase64,
            kdf_iterations: meta && meta.kdf_iterations,
            kdf_salt: meta && meta.kdf_salt,
            id: meta && meta.id,
            group_id: meta && meta.group_id
        };
        var deferred = $.Deferred();

        if (!subtle) {
            debugLog('decrypt.skip.no-webcrypto', {
                key: debugKeyLabel(password),
                meta: debugRecordMeta(recordMeta)
            });
            deferred.resolve(null);
            return deferred.promise();
        }

        debugLog('decrypt.start', {
            key: debugKeyLabel(password),
            meta: debugRecordMeta(recordMeta)
        });

        function resolveDecryptFailure(error) {
            debugLog('decrypt.fail', {
                key: debugKeyLabel(password),
                meta: debugRecordMeta(recordMeta),
                error: debugErrorText(error)
            });

            deferred.resolve(null);
        }

        getCryptoKey(password, meta).done(function (key) {
            var ivBytes;
            var ciphertextBytes;

            try {
                ivBytes = base64ToBuffer(ivBase64);
                ciphertextBytes = base64ToBuffer(ciphertextBase64);
            } catch (error) {
                resolveDecryptFailure(error);
                return;
            }

            fromNativePromise(subtle.decrypt(
                { name: 'AES-GCM', iv: ivBytes },
                key,
                ciphertextBytes
            )).done(function (decrypted) {
                var text;

                try {
                    text = bytesToUtf8(decrypted);
                } catch (error) {
                    resolveDecryptFailure(error);
                    return;
                }

                debugLog('decrypt.done', {
                    key: debugKeyLabel(password),
                    textLen: text.length,
                    meta: debugRecordMeta(recordMeta)
                });

                deferred.resolve(text);
            }).fail(resolveDecryptFailure);
        }).fail(resolveDecryptFailure);

        return deferred.promise();
    }

    function encryptTextWithFreshSalt(text, password) {
        var subtle = getSubtleCrypto();
        var iv;
        var saltBytes;
        var meta;

        if (!subtle || !window.crypto || !window.crypto.getRandomValues) {
            return rejected(new Error('AES-GCM недоступен в этом браузере.'));
        }

        iv = window.crypto.getRandomValues(new Uint8Array(12));
        saltBytes = randomBytes(KDF_SALT_BYTES);
        if (!saltBytes) {
            return rejected(new Error('crypto.getRandomValues недоступен в этом браузере.'));
        }

        meta = {
            kdf_iterations: KDF_ITERATIONS,
            kdf_salt: bufferToBase64(saltBytes)
        };

        return getCryptoKey(password, meta).then(function (key) {
            return fromNativePromise(subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, utf8ToBytes(text)));
        }).then(function (ciphertext) {
            return {
                iv: bufferToBase64(iv),
                ciphertext: bufferToBase64(ciphertext),
                kdf_iterations: meta.kdf_iterations,
                kdf_salt: meta.kdf_salt
            };
        });
    }

    function saveKeyToLocalStorage() {
        var isChecked = $('#rememberKey').prop('checked');
        var masterKey = $('#masterKey').val();

        localStorage.setItem(LS_TOGGLE_KEY, isChecked ? '1' : '0');
        debugLog('remember-key.save.start', {
            enabled: isChecked,
            hasKey: !!masterKey,
            key: debugKeyLabel(masterKey)
        });

        if (!isChecked || !masterKey) {
            localStorage.removeItem(LS_DATA_KEY);
            debugLog('remember-key.save.clear');
            return resolved();
        }

        return encryptData(masterKey, LS_SECRET_KEY).then(function (encrypted) {
            var payload = JSON.stringify(encrypted);
            localStorage.setItem(LS_DATA_KEY, btoa(btoa(btoa(payload))));
            debugLog('remember-key.save.done', {
                meta: debugRecordMeta(encrypted)
            });
        }, function (error) {
            debugLog('remember-key.save.fail', {
                error: debugErrorText(error)
            });
            logError('Ошибка шифрования для LocalStorage', error);
        });
    }

    function loadKeyFromLocalStorage() {
        var isChecked = localStorage.getItem(LS_TOGGLE_KEY) === '1';
        var encodedPayload;
        var encrypted;

        $('#rememberKey').prop('checked', isChecked);
        debugLog('remember-key.load.start', {
            enabled: isChecked
        });

        if (!isChecked) {
            return resolved();
        }

        encodedPayload = localStorage.getItem(LS_DATA_KEY);
        if (!encodedPayload) {
            debugLog('remember-key.load.empty');
            return resolved();
        }

        try {
            encrypted = JSON.parse(atob(atob(atob(encodedPayload))));
        } catch (error) {
            debugLog('remember-key.load.invalid', {
                error: debugErrorText(error)
            });
            logError('Ошибка чтения ключа из LocalStorage', error);
            localStorage.removeItem(LS_DATA_KEY);
            return resolved();
        }

        return decryptData(encrypted.ciphertext, encrypted.iv, LS_SECRET_KEY, encrypted).then(function (masterKey) {
            if (masterKey) {
                $('#masterKey').val(masterKey);
                lastMasterKeyInputValue = masterKey;
                debugLog('remember-key.load.done', {
                    key: debugKeyLabel(masterKey)
                });
                return;
            }

            debugLog('remember-key.load.fail.decrypt-null');
        });
    }

    function storedCheckboxValue(key, defaultValue) {
        var storedValue = localStorage.getItem(key);

        if (storedValue === null) {
            return defaultValue;
        }

        return storedValue === '1';
    }

    function authApi(payload) {
        debugLog('auth-api.post.start', {
            action: payload && payload.action ? payload.action : null,
            hasAuthPayload: !!(payload && payload.auth_payload),
            hasLoginEncrypted: !!(payload && payload.login_encrypted),
            hasPasswordEncrypted: !!(payload && payload.password_encrypted)
        });

        return $.ajax({
            url: 'api.php',
            type: 'POST',
            data: JSON.stringify(payload),
            contentType: 'application/json',
            dataType: 'json'
        }).then(function (response) {
            debugLog('auth-api.post.done', {
                action: payload && payload.action ? payload.action : null,
                status: response && response.status ? response.status : null,
                userId: response && response.user ? response.user.id : null
            });

            return response;
        }, function (xhr) {
            debugLog('auth-api.post.fail', {
                action: payload && payload.action ? payload.action : null,
                status: xhr && xhr.status,
                error: ajaxError(xhr).message
            });

            markApiOffline();
            return rejected(ajaxError(xhr));
        });
    }

    function setAuthMessage(message, isError) {
        $('#authMessage').text(message || '').toggleClass('error', !!isError);
    }

    function normalizeAppUrl() {
        var path = window.location.pathname;
        var normalizedPath;

        if (!window.history || !window.history.replaceState || !/\/index\.php$/i.test(path)) {
            return;
        }

        normalizedPath = path.replace(/index\.php$/i, '');
        window.history.replaceState(null, document.title, normalizedPath + window.location.search + window.location.hash);
    }

    function rememberAuthenticatedUser(user) {
        var loginLabel;
        var payload;

        if (!user || !user.id) {
            return;
        }

        loginLabel = user.login || localStorage.getItem('spm_login_' + user.id) || '';
        payload = {
            id: user.id,
            login: loginLabel,
            is_admin: user.is_admin ? 1 : 0
        };

        localStorage.setItem(LS_LAST_USER_KEY, JSON.stringify(payload));
    }

    function readLastAuthenticatedUser() {
        var rawPayload = localStorage.getItem(LS_LAST_USER_KEY);
        var payload;

        if (!rawPayload) {
            return null;
        }

        try {
            payload = JSON.parse(rawPayload);
        } catch (error) {
            localStorage.removeItem(LS_LAST_USER_KEY);
            return null;
        }

        if (!payload || !payload.id) {
            localStorage.removeItem(LS_LAST_USER_KEY);
            return null;
        }

        return payload;
    }

    function showAuth() {
        currentUser = null;
        $('#authLogin, #authPassword, #authKey').val('');
        $('#authShell').show();
        $('#appShell').hide();
        $('#currentUserBtn').text('');
        $('#adminLink').hide();
    }

    function showApp(user) {
        var loginLabel;

        currentUser = user;
        rememberAuthenticatedUser(user);
        loginLabel = user && user.id ? localStorage.getItem('spm_login_' + user.id) : '';
        normalizeAppUrl();
        $('#authShell').hide();
        $('#appShell').show();
        $('#currentUserBtn').text((user && user.login) || loginLabel || 'Пользователь');
        $('#adminLink').toggle(!!(user && user.is_admin));
        resetForm();
        debugLog('app.show', {
            userId: user && user.id ? user.id : null,
            loginLen: ((user && user.login) || loginLabel || '').length,
            offlineEnabled: isLocalDataStorageEnabled()
        });
        loadEncryptedDataFromLocalStorageInstant();
        fetchDataAfterLocalRender();
    }

    function setAuthMode(mode) {
        authMode = mode;
        $('.auth-tab').removeClass('active');
        $('.auth-tab[data-auth-mode="' + mode + '"]').addClass('active');
        $('#authSubmitBtn').text(mode === 'register' ? 'Зарегистрироваться' : 'Войти');
        setAuthMessage('', false);
    }

    function authPayload(login, password, authKey) {
        var basePayload = JSON.stringify({ login: login, password: password });

        return encryptTextWithFreshSalt(basePayload, authKey).then(function (authEncrypted) {
            return encryptTextWithFreshSalt(login, authKey).then(function (loginEncrypted) {
                return encryptTextWithFreshSalt(password, authKey).then(function (passwordEncrypted) {
                    return {
                        auth_payload: authEncrypted,
                        login_encrypted: loginEncrypted,
                        password_encrypted: passwordEncrypted
                    };
                });
            });
        });
    }

    function submitAuth() {
        var login = $('#authLogin').val();
        var password = $('#authPassword').val();
        var authKey = $('#authKey').val();

        if (!login || !password || !authKey) {
            setAuthMessage('Введите логин, пароль и ключ шифрования.', true);
            return;
        }

        $('#authSubmitBtn').prop('disabled', true);
        setAuthMessage('', false);

        authPayload(login, password, authKey).then(function (payload) {
            payload.action = authMode;
            payload.auth_key = authKey;
            return authApi(payload);
        }).then(function (response) {
            if (authMode === 'register') {
                setAuthMessage('Заявка создана. Дождитесь подтверждения администратора.', false);
                setAuthMode('login');
                return;
            }

            response.user.login = login;
            csrfToken = response.csrf || '';
            localStorage.setItem('spm_login_' + response.user.id, login);
            localStorage.setItem(LS_STORE_LOCAL_DATA_KEY, '1');
            localStorage.removeItem(LS_TOGGLE_KEY);
            localStorage.removeItem(LS_DATA_KEY);
            removeLocalEncryptedDataForUser(response.user);
            $('#storeLocalData').prop('checked', true);
            $('#rememberKey').prop('checked', false);
            $('#hidePasswords, #hideUsernames, #hideNotes, #hideOtp').prop('checked', true);
            saveVisibilitySettings();
            debugLog('auth.login.success', {
                userId: response.user.id,
                offlineReset: true,
                rememberKeyReset: true
            });
            showApp(response.user);
        }, function (error) {
            setAuthMessage(error.message, true);
        }).always(function () {
            $('#authSubmitBtn').prop('disabled', false);
        });
    }

    function checkSession() {
        debugLog('session.check.start');

        return $.getJSON('api.php?action=session').then(function (response) {
            debugLog('session.check.done', {
                authenticated: !!(response && response.authenticated),
                userId: response && response.user ? response.user.id : null
            });

            if (response && response.authenticated) {
                csrfToken = response.csrf || '';
                showApp(response.user);
                return;
            }

            csrfToken = '';
            showAuth();
        }, function () {
            var lastUser = readLastAuthenticatedUser();

            debugLog('session.check.fail', {
                offlineEnabled: isLocalDataStorageEnabled(),
                lastUserId: lastUser && lastUser.id ? lastUser.id : null
            });

            if (hasLocalEncryptedDataForUser(lastUser)) {
                showApp(lastUser);
                return;
            }

            showAuth();
        });
    }

    function logout() {
        if (!confirm('Выйти из аккаунта?')) {
            return;
        }

        apiCall({ action: 'logout' }).always(function () {
            csrfToken = '';
            localStorage.removeItem(LS_LAST_USER_KEY);
            localStorage.setItem(LS_STORE_LOCAL_DATA_KEY, '1');
            localStorage.removeItem(LS_TOGGLE_KEY);
            localStorage.removeItem(LS_DATA_KEY);
            removeLocalEncryptedData();
            $('#storeLocalData').prop('checked', true);
            $('#rememberKey').prop('checked', false);
            $('#masterKey').val('');
            lastMasterKeyInputValue = '';
            dbPasswords = [];
            dbGroups = [];
            decryptedDataCache = [];
            decryptedGroupsCache = [];
            renderTabs();
            updateSelectOptions();
            renderPasswords();
            showAuth();
        });
    }

    function saveVisibilitySettings() {
        localStorage.setItem(LS_HIDE_PASSWORDS_KEY, $('#hidePasswords').prop('checked') ? '1' : '0');
        localStorage.setItem(LS_HIDE_USERNAMES_KEY, $('#hideUsernames').prop('checked') ? '1' : '0');
        localStorage.setItem(LS_HIDE_NOTES_KEY, $('#hideNotes').prop('checked') ? '1' : '0');
        localStorage.setItem(LS_HIDE_OTP_KEY, $('#hideOtp').prop('checked') ? '1' : '0');
        debugLog('visibility.save', {
            passwords: $('#hidePasswords').prop('checked'),
            usernames: $('#hideUsernames').prop('checked'),
            notes: $('#hideNotes').prop('checked'),
            otp: $('#hideOtp').prop('checked')
        });
    }

    function loadVisibilitySettings() {
        $('#hidePasswords').prop('checked', storedCheckboxValue(LS_HIDE_PASSWORDS_KEY, true));
        $('#hideUsernames').prop('checked', storedCheckboxValue(LS_HIDE_USERNAMES_KEY, true));
        $('#hideNotes').prop('checked', storedCheckboxValue(LS_HIDE_NOTES_KEY, true));
        $('#hideOtp').prop('checked', storedCheckboxValue(LS_HIDE_OTP_KEY, true));
        debugLog('visibility.load', {
            passwords: $('#hidePasswords').prop('checked'),
            usernames: $('#hideUsernames').prop('checked'),
            notes: $('#hideNotes').prop('checked'),
            otp: $('#hideOtp').prop('checked')
        });
    }

    function saveLocalDataSettings() {
        var enabled = $('#storeLocalData').prop('checked');

        localStorage.setItem(LS_STORE_LOCAL_DATA_KEY, enabled ? '1' : '0');
        debugLog('offline.setting.save', {
            enabled: enabled
        });
    }

    function loadLocalDataSettings() {
        var enabled = storedCheckboxValue(LS_STORE_LOCAL_DATA_KEY, true);

        $('#storeLocalData').prop('checked', enabled);
        debugLog('offline.setting.load', {
            enabled: enabled
        });
    }

    function applyDarkTheme(enabled) {
        if (enabled) {
            $('body').addClass('dark-theme');
        } else {
            $('body').removeClass('dark-theme');
        }
    }

    function loadDarkThemeSetting() {
        var enabled = storedCheckboxValue(LS_DARK_THEME_KEY, false);
        $('#darkTheme').prop('checked', enabled);
        applyDarkTheme(enabled);
    }

    function onDarkThemeChange() {
        var enabled = $('#darkTheme').prop('checked');
        localStorage.setItem(LS_DARK_THEME_KEY, enabled ? '1' : '0');
        applyDarkTheme(enabled);
    }

    function isLocalDataStorageEnabled() {
        return $('#storeLocalData').prop('checked');
    }

    function localDataKeyForUser(user) {
        return LS_LOCAL_DATA_KEY + '_' + (user && user.id ? user.id : 'guest');
    }

    function localDataKey() {
        return localDataKeyForUser(currentUser);
    }

    function hasLocalEncryptedDataForUser(user) {
        var enabled = isLocalDataStorageEnabled();
        var hasData = false;

        if (enabled && user && user.id) {
            hasData = !!localStorage.getItem(localDataKeyForUser(user));
        }

        debugLog('offline.has-local-data', {
            enabled: enabled,
            userId: user && user.id ? user.id : null,
            hasData: hasData
        });

        return hasData;
    }

    function removeLocalEncryptedDataForUser(user) {
        var key = localDataKeyForUser(user);

        try {
            localStorage.removeItem(key);
        } catch (ignore) {}

        debugLog('offline.cache.remove', {
            key: key,
            userId: user && user.id ? user.id : null
        });
    }

    function removeLocalEncryptedData() {
        removeLocalEncryptedDataForUser(currentUser);
        localDataCacheLoaded = false;
        localDataRenderPromise = null;
    }

    function saveLocalEncryptedData() {
        var payload;
        var key;

        if (!isLocalDataStorageEnabled()) {
            debugLog('offline.cache.save.skip.disabled');
            return;
        }

        key = localDataKey();
        payload = {
            saved_at: Math.floor(new Date().getTime() / 1000),
            passwords: dbPasswords || [],
            groups: dbGroups || []
        };

        try {
            localStorage.setItem(key, JSON.stringify(payload));
            debugLog('offline.cache.save.done', {
                key: key,
                passwords: payload.passwords.length,
                groups: payload.groups.length,
                savedAt: payload.saved_at
            });
        } catch (error) {
            debugLog('offline.cache.save.fail', {
                key: key,
                error: debugErrorText(error)
            });
            logError('Ошибка сохранения локального кэша', error);
        }
    }

    function readLocalEncryptedDataPayload() {
        var key;
        var rawPayload;
        var payload;

        if (!isLocalDataStorageEnabled()) {
            debugLog('offline.cache.read.skip.disabled');
            return null;
        }

        key = localDataKey();
        rawPayload = localStorage.getItem(key);
        if (!rawPayload) {
            debugLog('offline.cache.read.empty', {
                key: key
            });
            return null;
        }

        try {
            payload = JSON.parse(rawPayload);
        } catch (error) {
            debugLog('offline.cache.read.invalid-json', {
                key: key,
                error: debugErrorText(error)
            });
            removeLocalEncryptedData();
            return null;
        }

        if (!payload || !payload.passwords || !payload.groups) {
            debugLog('offline.cache.read.invalid-shape', {
                key: key
            });
            removeLocalEncryptedData();
            return null;
        }

        debugLog('offline.cache.read.done', {
            key: key,
            passwords: payload.passwords.length,
            groups: payload.groups.length,
            savedAt: payload.saved_at || null
        });

        return payload;
    }

    function loadEncryptedDataFromLocalStorage() {
        var payload = readLocalEncryptedDataPayload();
        var i;
        var normalized;

        if (!payload) {
            localDataCacheLoaded = false;
            localDataRenderPromise = resolved(false);
            debugLog('offline.render.skip.no-payload');
            return localDataRenderPromise;
        }

        dbPasswords = [];
        dbGroups = [];

        for (i = 0; i < payload.passwords.length; i += 1) {
            normalized = normalizeEncryptedPassword(payload.passwords[i]);
            if (normalized) {
                dbPasswords.push(normalized);
            }
        }

        for (i = 0; i < payload.groups.length; i += 1) {
            normalized = normalizeEncryptedGroup(payload.groups[i]);
            if (normalized) {
                dbGroups.push(normalized);
            }
        }

        localDataCacheLoaded = true;
        debugLog('offline.render.start', {
            passwords: dbPasswords.length,
            groups: dbGroups.length
        });

        localDataRenderPromise = processAndRender().then(function () {
            debugLog('offline.render.done', {
                passwords: dbPasswords.length,
                groups: dbGroups.length
            });
            return true;
        });

        return localDataRenderPromise;
    }

    function loadEncryptedDataFromLocalStorageInstant() {
        loadEncryptedDataFromLocalStorage();
    }

    function formatLocalTime(unixTimestamp) {
        if (!unixTimestamp) {
            return '?';
        }

        return new Date(unixTimestamp * 1000).toLocaleString();
    }

    function ajaxError(xhr) {
        var response = xhr.responseJSON;
        var message = 'HTTP ' + xhr.status;

        if (!response && xhr.responseText) {
            try {
                response = JSON.parse(xhr.responseText);
            } catch (ignore) {}
        }

        if (response && response.error) {
            message = response.error;
        }

        return new Error(message);
    }

    function apiCall(payload) {
        if (csrfToken && !payload.csrf) {
            payload.csrf = csrfToken;
        }
        debugLog('api.post.start', debugApiPayload(payload));

        return $.ajax({
            url: 'api.php',
            type: 'POST',
            data: JSON.stringify(payload),
            contentType: 'application/json',
            dataType: 'json'
        }).then(function (response) {
            debugLog('api.post.done', {
                request: debugApiPayload(payload),
                response: debugApiResponse(response)
            });

            return response;
        }, function (xhr) {
            debugLog('api.post.fail', {
                request: debugApiPayload(payload),
                status: xhr && xhr.status,
                error: ajaxError(xhr).message
            });

            markApiOffline();
            return rejected(ajaxError(xhr));
        });
    }

    function addEncryptionFields(payload, encrypted) {
        payload.ciphertext = encrypted.ciphertext;
        payload.iv = encrypted.iv;
        payload.kdf_iterations = encrypted.kdf_iterations || null;
        payload.kdf_salt = encrypted.kdf_salt || null;
        return payload;
    }

    function whenAll(promises) {
        var deferred = $.Deferred();

        if (!promises.length) {
            deferred.resolve([]);
            return deferred.promise();
        }

        $.when.apply($, promises).done(function () {
            var results;

            if (promises.length === 1) {
                results = [arguments[0]];
            } else {
                results = Array.prototype.slice.call(arguments);
            }

            deferred.resolve(results);
        }).fail(function (error) {
            deferred.reject(error);
        });

        return deferred.promise();
    }

    function decryptGroup(group, masterKey) {
        if (!masterKey) {
            debugLog('group.decrypt.skip.no-key', {
                group: debugRecordMeta(group)
            });

            return resolved({
                id: group.id,
                name: '[Зашифровано]',
                isDecrypted: false
            });
        }

        debugLog('group.decrypt.start', {
            key: debugKeyLabel(masterKey),
            group: debugRecordMeta(group)
        });

        return decryptData(group.ciphertext, group.iv, masterKey, group).then(function (decrypted) {
            var name = '[Неверный ключ]';
            var isDecrypted = false;
            var payload;
            var parseError = false;

            if (decrypted) {
                try {
                    payload = JSON.parse(decrypted);
                    name = payload.name;
                    isDecrypted = true;
                } catch (ignore) {
                    parseError = true;
                }
            }

            debugLog('group.decrypt.result', {
                key: debugKeyLabel(masterKey),
                groupId: group.id,
                decrypted: isDecrypted,
                parseError: parseError,
                plainLen: decrypted ? decrypted.length : 0
            });

            return {
                id: group.id,
                name: name,
                isDecrypted: isDecrypted
            };
        }, function () {
            debugLog('group.decrypt.promise-fail', {
                key: debugKeyLabel(masterKey),
                group: debugRecordMeta(group)
            });

            return {
                id: group.id,
                name: '[Неверный ключ]',
                isDecrypted: false
            };
        });
    }

    function decryptPassword(item, masterKey) {
        var encryptedPayload = {
            title: '[Зашифровано]',
            username: '[Зашифровано]',
            password: '***',
            notes: '',
            otp: ''
        };

        if (!masterKey) {
            debugLog('password.decrypt.skip.no-key', {
                password: debugRecordMeta(item)
            });

            return resolved({
                id: item.id,
                groupId: item.group_id,
                isDecrypted: false,
                payload: encryptedPayload,
                original: item
            });
        }

        debugLog('password.decrypt.start', {
            key: debugKeyLabel(masterKey),
            password: debugRecordMeta(item)
        });

        return decryptData(item.ciphertext, item.iv, masterKey, item).then(function (decrypted) {
            var payload = encryptedPayload;
            var isDecrypted = false;
            var parseError = false;

            if (decrypted) {
                try {
                    payload = JSON.parse(decrypted);
                    payload.title = payload.title || '';
                    payload.username = payload.username || '';
                    payload.password = payload.password || '';
                    payload.notes = payload.notes || '';
                    payload.otp = payload.otp || '';
                    isDecrypted = true;
                } catch (ignore) {
                    parseError = true;
                    payload.title = '[Ошибка]';
                }
            } else {
                payload.title = '[Неверный ключ]';
                payload.username = '[Неверный ключ]';
            }

            debugLog('password.decrypt.result', {
                key: debugKeyLabel(masterKey),
                passwordId: item.id,
                decrypted: isDecrypted,
                parseError: parseError,
                plainLen: decrypted ? decrypted.length : 0
            });

            return {
                id: item.id,
                groupId: item.group_id,
                isDecrypted: isDecrypted,
                payload: payload,
                original: item
            };
        }, function () {
            debugLog('password.decrypt.promise-fail', {
                key: debugKeyLabel(masterKey),
                password: debugRecordMeta(item)
            });

            return {
                id: item.id,
                groupId: item.group_id,
                isDecrypted: false,
                payload: {
                    title: '[Неверный ключ]',
                    username: '[Неверный ключ]',
                    password: '***',
                    notes: '',
                    otp: ''
                },
                original: item
            };
        });
    }

    function renderLockedVault() {
        var groups = [];
        var passwords = [];
        var i;
        var item;

        for (i = 0; i < dbGroups.length; i += 1) {
            groups.push({
                id: dbGroups[i].id,
                name: '[Зашифровано]',
                isDecrypted: false
            });
        }

        for (i = 0; i < dbPasswords.length; i += 1) {
            item = dbPasswords[i];
            passwords.push({
                id: item.id,
                groupId: item.group_id,
                isDecrypted: false,
                payload: {
                    title: '[Зашифровано]',
                    username: '[Зашифровано]',
                    password: '***',
                    notes: '',
                    otp: ''
                },
                original: item
            });
        }

        inlineEditId = null;
        decryptedGroupsCache = groups;
        decryptedDataCache = passwords;
        renderTabs();
        updateSelectOptions();
        renderPasswords();
    }

    function isRenderStillCurrent(masterKey, changeVersion, requestVersion) {
        return renderRequestVersion === requestVersion &&
            masterKeyChangeVersion === changeVersion &&
            $('#masterKey').val() === masterKey;
    }

    function processAndRender() {
        var masterKey = $('#masterKey').val();
        var changeVersion = masterKeyChangeVersion;
        var requestVersion = renderRequestVersion + 1;
        var groupPromises = [];
        var passwordPromises = [];
        var i;

        renderRequestVersion = requestVersion;
        debugLog('render.start', {
            requestVersion: requestVersion,
            key: debugKeyLabel(masterKey),
            keyChangeVersion: changeVersion,
            dbGroups: dbGroups.length,
            dbPasswords: dbPasswords.length
        });

        for (i = 0; i < dbGroups.length; i += 1) {
            groupPromises.push(decryptGroup(dbGroups[i], masterKey));
        }

        for (i = 0; i < dbPasswords.length; i += 1) {
            passwordPromises.push(decryptPassword(dbPasswords[i], masterKey));
        }

        return whenAll(groupPromises).then(function (groups) {
            if (!isRenderStillCurrent(masterKey, changeVersion, requestVersion)) {
                debugLog('render.stale.after-groups', {
                    requestVersion: requestVersion,
                    activeRequestVersion: renderRequestVersion,
                    key: debugKeyLabel(masterKey),
                    currentKey: debugKeyLabel($('#masterKey').val()),
                    keyChangeVersion: changeVersion,
                    activeKeyChangeVersion: masterKeyChangeVersion
                });
                return null;
            }

            decryptedGroupsCache = groups;
            debugLog('render.groups.done', {
                requestVersion: requestVersion,
                groups: groups.length,
                decrypted: countDecryptedItems(groups)
            });
            return whenAll(passwordPromises);
        }).then(function (passwords) {
            if (!passwords || !isRenderStillCurrent(masterKey, changeVersion, requestVersion)) {
                debugLog('render.stale.after-passwords', {
                    requestVersion: requestVersion,
                    activeRequestVersion: renderRequestVersion,
                    key: debugKeyLabel(masterKey),
                    currentKey: debugKeyLabel($('#masterKey').val()),
                    keyChangeVersion: changeVersion,
                    activeKeyChangeVersion: masterKeyChangeVersion,
                    hasPasswords: !!passwords
                });
                return;
            }

            decryptedDataCache = passwords;
            renderTabs();
            updateSelectOptions();
            renderPasswords();
            debugLog('render.done', {
                requestVersion: requestVersion,
                groups: decryptedGroupsCache.length,
                decryptedGroups: countDecryptedItems(decryptedGroupsCache),
                passwords: decryptedDataCache.length,
                decryptedPasswords: countDecryptedItems(decryptedDataCache)
            });
        });
    }

    function fetchData() {
        debugLog('fetch.start', {
            url: 'api.php',
            key: debugKeyLabel($('#masterKey').val())
        });

        return $.ajax({
            url: 'api.php?_=' + new Date().getTime(),
            type: 'GET',
            cache: false,
            dataType: 'json'
        }).then(function (data) {
            var passwords = data.passwords || [];
            var groups = data.groups || [];
            var i;
            var normalized;

            debugLog('fetch.done.raw', debugApiResponse(data));

            dbPasswords = [];
            dbGroups = [];

            for (i = 0; i < passwords.length; i += 1) {
                normalized = normalizeEncryptedPassword(passwords[i]);
                if (normalized) {
                    dbPasswords.push(normalized);
                }
            }

            for (i = 0; i < groups.length; i += 1) {
                normalized = normalizeEncryptedGroup(groups[i]);
                if (normalized) {
                    dbGroups.push(normalized);
                }
            }

            debugLog('fetch.done.normalized', {
                passwordCount: dbPasswords.length,
                groupCount: dbGroups.length,
                groups: dbGroups.map ? dbGroups.map(debugRecordMeta) : []
            });

            localDataCacheLoaded = false;
            saveLocalEncryptedData();
            return processAndRender();
        }, function (xhr) {
            debugLog('fetch.fail', {
                status: xhr && xhr.status,
                error: ajaxError(xhr).message,
                localDataLoaded: localDataCacheLoaded,
                online: navigator.onLine !== false
            });

            if (xhr && xhr.status === 401) {
                showAuth();
                return;
            }

            markApiOffline();

            if (localDataCacheLoaded || navigator.onLine === false) {
                return;
            }

            alert('Ошибка загрузки: ' + ajaxError(xhr).message);
        });
    }

    function fetchDataAfterLocalRender() {
        return $.when(localDataRenderPromise || resolved(false)).always(function () {
            debugLog('fetch.after-local-render');
            fetchData();
        });
    }

    function escapeHTML(value) {
        var entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        };

        return String(value || '').replace(/[&<>'"]/g, function (tag) {
            return entityMap[tag];
        });
    }

    function parseQueryString(query) {
        var params = {};
        var parts = String(query || '').replace(/^\?/, '').split('&');
        var i;
        var pair;
        var key;
        var value;

        for (i = 0; i < parts.length; i += 1) {
            if (!parts[i]) {
                continue;
            }

            pair = parts[i].split('=');
            try {
                key = decodeURIComponent(String(pair[0] || '').replace(/\+/g, ' ')).toLowerCase();
                value = decodeURIComponent(String(pair.slice(1).join('=') || '').replace(/\+/g, ' '));
            } catch (ignore) {
                continue;
            }

            if (key) {
                params[key] = value;
            }
        }

        return params;
    }

    function parseOtpConfig(value) {
        var raw = String(value || '').trim();
        var params = {};
        var questionIndex;
        var algorithm;
        var digits;
        var period;
        var secret;

        if (!raw) {
            return null;
        }

        if (/^otpauth:\/\/totp\//i.test(raw)) {
            questionIndex = raw.indexOf('?');
            params = questionIndex === -1 ? {} : parseQueryString(raw.substring(questionIndex + 1));
            secret = params.secret;
        } else {
            secret = raw;
        }

        secret = String(secret || '').replace(/[\s-]/g, '').replace(/=+$/g, '').toUpperCase();
        algorithm = String(params.algorithm || 'SHA1').toUpperCase().replace(/[^A-Z0-9]/g, '');
        digits = parseInt(params.digits || '6', 10);
        period = parseInt(params.period || '30', 10);

        if (algorithm === 'SHA1') {
            algorithm = 'SHA-1';
        } else if (algorithm === 'SHA256') {
            algorithm = 'SHA-256';
        } else if (algorithm === 'SHA512') {
            algorithm = 'SHA-512';
        } else {
            algorithm = 'SHA-1';
        }

        if (!digits || digits < 6 || digits > 8) {
            digits = 6;
        }

        if (!period || period < 5 || period > 300) {
            period = 30;
        }

        return {
            raw: raw,
            secret: secret,
            algorithm: algorithm,
            digits: digits,
            period: period,
            isUri: /^otpauth:\/\/totp\//i.test(raw)
        };
    }

    function base32ToBytes(value) {
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        var clean = String(value || '').replace(/[\s-]/g, '').replace(/=+$/g, '').toUpperCase();
        var bits = 0;
        var bitLength = 0;
        var bytes = [];
        var i;
        var index;

        if (!clean) {
            throw new Error('OTP secret is empty');
        }

        for (i = 0; i < clean.length; i += 1) {
            index = alphabet.indexOf(clean.charAt(i));
            if (index === -1) {
                throw new Error('Invalid OTP secret');
            }

            bits = (bits << 5) | index;
            bitLength += 5;

            while (bitLength >= 8) {
                bytes.push((bits >>> (bitLength - 8)) & 255);
                bitLength -= 8;
            }
        }

        return new Uint8Array(bytes);
    }

    function counterToBytes(counter) {
        var bytes = new Uint8Array(8);
        var i;

        for (i = 7; i >= 0; i -= 1) {
            bytes[i] = counter & 255;
            counter = Math.floor(counter / 256);
        }

        return bytes;
    }

    function padOtpCode(code, digits) {
        var text = String(code);

        while (text.length < digits) {
            text = '0' + text;
        }

        return text;
    }

    function formatOtpDisplay(code) {
        if (String(code).length === 6) {
            return String(code).substring(0, 3) + ' ' + String(code).substring(3);
        }

        return code;
    }

    function generateTotp(value, timeMs) {
        var subtle = getSubtleCrypto();
        var config = parseOtpConfig(value);
        var secretBytes;
        var counter;
        var remaining;

        if (!config) {
            return rejected(new Error('OTP is empty'));
        }

        if (!subtle) {
            return rejected(new Error('WebCrypto is unavailable'));
        }

        try {
            secretBytes = base32ToBytes(config.secret);
        } catch (error) {
            return rejected(error);
        }

        timeMs = timeMs || Date.now();
        counter = Math.floor(Math.floor(timeMs / 1000) / config.period);
        remaining = config.period - (Math.floor(timeMs / 1000) % config.period);

        return fromNativePromise(subtle.importKey(
            'raw',
            secretBytes,
            { name: 'HMAC', hash: { name: config.algorithm } },
            false,
            ['sign']
        )).then(function (key) {
            return fromNativePromise(subtle.sign('HMAC', key, counterToBytes(counter)));
        }).then(function (signature) {
            var hash = new Uint8Array(signature);
            var offset = hash[hash.length - 1] & 15;
            var binary = ((hash[offset] & 127) << 24) |
                ((hash[offset + 1] & 255) << 16) |
                ((hash[offset + 2] & 255) << 8) |
                (hash[offset + 3] & 255);
            var modulo = Math.pow(10, config.digits);
            var code = padOtpCode(binary % modulo, config.digits);

            return {
                code: code,
                display: formatOtpDisplay(code),
                remaining: remaining,
                config: config
            };
        });
    }

    function appendQrBits(bits, value, length) {
        var i;

        for (i = length - 1; i >= 0; i -= 1) {
            bits.push((value >>> i) & 1);
        }
    }

    function gfMultiply(x, y) {
        var z = 0;

        while (y > 0) {
            if (y & 1) {
                z ^= x;
            }

            x <<= 1;
            if (x & 256) {
                x ^= 0x11D;
            }
            y >>>= 1;
        }

        return z & 255;
    }

    function gfPow2(power) {
        var value = 1;

        while (power > 0) {
            value = gfMultiply(value, 2);
            power -= 1;
        }

        return value;
    }

    function reedSolomonDivisor(degree) {
        var result = [1];
        var i;
        var j;
        var root;
        var next;

        for (i = 0; i < degree; i += 1) {
            root = gfPow2(i);
            next = [];
            for (j = 0; j < result.length + 1; j += 1) {
                next.push(0);
            }
            for (j = 0; j < result.length; j += 1) {
                next[j] ^= result[j];
                next[j + 1] ^= gfMultiply(result[j], root);
            }
            result = next;
        }

        return result;
    }

    function reedSolomonRemainder(data, degree) {
        var divisor = reedSolomonDivisor(degree);
        var result = data.slice();
        var i;
        var j;
        var factor;

        for (i = 0; i < degree; i += 1) {
            result.push(0);
        }

        for (i = 0; i < data.length; i += 1) {
            factor = result[i];
            if (!factor) {
                continue;
            }

            for (j = 1; j < divisor.length; j += 1) {
                result[i + j] ^= gfMultiply(divisor[j], factor);
            }
        }

        return result.slice(result.length - degree);
    }

    function qrMatrix(size, value) {
        var rows = [];
        var y;
        var x;
        var row;

        for (y = 0; y < size; y += 1) {
            row = [];
            for (x = 0; x < size; x += 1) {
                row.push(value);
            }
            rows.push(row);
        }

        return rows;
    }

    function cloneQrMatrix(matrix) {
        var clone = [];
        var y;

        for (y = 0; y < matrix.length; y += 1) {
            clone.push(matrix[y].slice());
        }

        return clone;
    }

    function setQrModule(modules, reserved, x, y, dark, isFunction) {
        if (y < 0 || y >= modules.length || x < 0 || x >= modules.length) {
            return;
        }

        modules[y][x] = !!dark;
        if (isFunction) {
            reserved[y][x] = true;
        }
    }

    function drawQrFinder(modules, reserved, centerX, centerY) {
        var dx;
        var dy;
        var distance;

        for (dy = -4; dy <= 4; dy += 1) {
            for (dx = -4; dx <= 4; dx += 1) {
                distance = Math.max(Math.abs(dx), Math.abs(dy));
                setQrModule(modules, reserved, centerX + dx, centerY + dy, distance !== 2 && distance !== 4, true);
            }
        }
    }

    function qrAlignmentPositions(version) {
        var positions = {
            1: [],
            2: [6, 18],
            3: [6, 22],
            4: [6, 26],
            5: [6, 30],
            6: [6, 34],
            7: [6, 22, 38],
            8: [6, 24, 42],
            9: [6, 26, 46],
            10: [6, 28, 50]
        };

        return positions[version] || [];
    }

    function drawQrAlignment(modules, reserved, centerX, centerY) {
        var dx;
        var dy;

        for (dy = -2; dy <= 2; dy += 1) {
            for (dx = -2; dx <= 2; dx += 1) {
                setQrModule(modules, reserved, centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, true);
            }
        }
    }

    function qrFormatBits(mask) {
        var data = mask;
        var rem = data;
        var i;

        for (i = 0; i < 10; i += 1) {
            rem = (rem << 1) ^ (((rem >>> 9) & 1) ? 0x537 : 0);
        }

        return ((data << 10) | rem) ^ 0x5412;
    }

    function qrVersionBits(version) {
        var rem = version;
        var i;

        for (i = 0; i < 12; i += 1) {
            rem = (rem << 1) ^ (((rem >>> 11) & 1) ? 0x1F25 : 0);
        }

        return (version << 12) | rem;
    }

    function drawQrFormat(modules, reserved, mask) {
        var size = modules.length;
        var bits = qrFormatBits(mask);
        var i;
        var bit;

        for (i = 0; i <= 5; i += 1) {
            setQrModule(modules, reserved, 8, i, ((bits >>> i) & 1) !== 0, true);
        }
        setQrModule(modules, reserved, 8, 7, ((bits >>> 6) & 1) !== 0, true);
        setQrModule(modules, reserved, 8, 8, ((bits >>> 7) & 1) !== 0, true);
        setQrModule(modules, reserved, 7, 8, ((bits >>> 8) & 1) !== 0, true);
        for (i = 9; i < 15; i += 1) {
            setQrModule(modules, reserved, 14 - i, 8, ((bits >>> i) & 1) !== 0, true);
        }

        for (i = 0; i < 8; i += 1) {
            bit = ((bits >>> i) & 1) !== 0;
            setQrModule(modules, reserved, size - 1 - i, 8, bit, true);
        }
        for (i = 8; i < 15; i += 1) {
            bit = ((bits >>> i) & 1) !== 0;
            setQrModule(modules, reserved, 8, size - 15 + i, bit, true);
        }

        setQrModule(modules, reserved, 8, size - 8, true, true);
    }

    function drawQrVersion(modules, reserved, version) {
        var size = modules.length;
        var bits;
        var i;
        var bit;
        var a;
        var b;

        if (version < 7) {
            return;
        }

        bits = qrVersionBits(version);
        for (i = 0; i < 18; i += 1) {
            bit = ((bits >>> i) & 1) !== 0;
            a = size - 11 + (i % 3);
            b = Math.floor(i / 3);
            setQrModule(modules, reserved, a, b, bit, true);
            setQrModule(modules, reserved, b, a, bit, true);
        }
    }

    function drawQrFunctionPatterns(version) {
        var size = 21 + (version - 1) * 4;
        var modules = qrMatrix(size, false);
        var reserved = qrMatrix(size, false);
        var positions = qrAlignmentPositions(version);
        var i;
        var j;
        var x;

        drawQrFinder(modules, reserved, 3, 3);
        drawQrFinder(modules, reserved, size - 4, 3);
        drawQrFinder(modules, reserved, 3, size - 4);

        for (i = 0; i < size; i += 1) {
            if (!reserved[6][i]) {
                setQrModule(modules, reserved, i, 6, i % 2 === 0, true);
            }
            if (!reserved[i][6]) {
                setQrModule(modules, reserved, 6, i, i % 2 === 0, true);
            }
        }

        for (i = 0; i < positions.length; i += 1) {
            for (j = 0; j < positions.length; j += 1) {
                if (!reserved[positions[j]][positions[i]]) {
                    drawQrAlignment(modules, reserved, positions[i], positions[j]);
                }
            }
        }

        drawQrFormat(modules, reserved, 0);
        drawQrVersion(modules, reserved, version);

        return {
            modules: modules,
            reserved: reserved
        };
    }

    function qrMaskBit(mask, x, y) {
        if (mask === 0) {
            return (x + y) % 2 === 0;
        }
        if (mask === 1) {
            return y % 2 === 0;
        }
        if (mask === 2) {
            return x % 3 === 0;
        }
        if (mask === 3) {
            return (x + y) % 3 === 0;
        }
        if (mask === 4) {
            return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
        }
        if (mask === 5) {
            return ((x * y) % 2 + (x * y) % 3) === 0;
        }
        if (mask === 6) {
            return (((x * y) % 2 + (x * y) % 3) % 2) === 0;
        }

        return (((x + y) % 2 + (x * y) % 3) % 2) === 0;
    }

    function placeQrData(modules, reserved, codewords, mask) {
        var size = modules.length;
        var bitIndex = 0;
        var totalBits = codewords.length * 8;
        var right;
        var vertical;
        var y;
        var x;
        var bit;

        for (right = size - 1; right >= 1; right -= 2) {
            if (right === 6) {
                right -= 1;
            }

            for (vertical = 0; vertical < size; vertical += 1) {
                y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;

                for (x = right; x >= right - 1; x -= 1) {
                    if (reserved[y][x]) {
                        continue;
                    }

                    bit = false;
                    if (bitIndex < totalBits) {
                        bit = ((codewords[Math.floor(bitIndex / 8)] >>> (7 - (bitIndex % 8))) & 1) !== 0;
                        bitIndex += 1;
                    }

                    modules[y][x] = bit !== qrMaskBit(mask, x, y);
                }
            }
        }
    }

    function qrPenalty(modules) {
        var size = modules.length;
        var penalty = 0;
        var dark = 0;
        var y;
        var x;
        var runColor;
        var runLength;

        function scoreLine(line) {
            var score = 0;
            var i;
            var color = line[0];
            var length = 1;

            for (i = 1; i < line.length; i += 1) {
                if (line[i] === color) {
                    length += 1;
                } else {
                    if (length >= 5) {
                        score += 3 + length - 5;
                    }
                    color = line[i];
                    length = 1;
                }
            }

            if (length >= 5) {
                score += 3 + length - 5;
            }

            for (i = 0; i + 6 < line.length; i += 1) {
                if (line[i] && !line[i + 1] && line[i + 2] && line[i + 3] && line[i + 4] && !line[i + 5] && line[i + 6]) {
                    if (i >= 4 && !line[i - 1] && !line[i - 2] && !line[i - 3] && !line[i - 4]) {
                        score += 40;
                    }
                    if (i + 10 < line.length && !line[i + 7] && !line[i + 8] && !line[i + 9] && !line[i + 10]) {
                        score += 40;
                    }
                }
            }

            return score;
        }

        for (y = 0; y < size; y += 1) {
            penalty += scoreLine(modules[y]);
        }

        for (x = 0; x < size; x += 1) {
            runColor = [];
            for (y = 0; y < size; y += 1) {
                runColor.push(modules[y][x]);
            }
            penalty += scoreLine(runColor);
        }

        for (y = 0; y < size - 1; y += 1) {
            for (x = 0; x < size - 1; x += 1) {
                if (modules[y][x] === modules[y][x + 1] &&
                    modules[y][x] === modules[y + 1][x] &&
                    modules[y][x] === modules[y + 1][x + 1]) {
                    penalty += 3;
                }
            }
        }

        for (y = 0; y < size; y += 1) {
            for (x = 0; x < size; x += 1) {
                if (modules[y][x]) {
                    dark += 1;
                }
            }
        }

        runLength = Math.abs(Math.ceil(dark * 20 / (size * size)) - 10);
        penalty += runLength * 10;

        return penalty;
    }

    function qrCodewords(text) {
        var QR_M_TABLE = [
            null,
            { total: 26, ec: 10, blocks: 1 },
            { total: 44, ec: 16, blocks: 1 },
            { total: 70, ec: 26, blocks: 1 },
            { total: 100, ec: 18, blocks: 2 },
            { total: 134, ec: 24, blocks: 2 },
            { total: 172, ec: 16, blocks: 4 },
            { total: 196, ec: 18, blocks: 4 },
            { total: 242, ec: 22, blocks: 4 },
            { total: 292, ec: 22, blocks: 5 },
            { total: 346, ec: 26, blocks: 5 }
        ];
        var bytes = Array.prototype.slice.call(utf8ToBytes(text));
        var version;
        var table;
        var dataCodewords;
        var bits;
        var capacityBits;
        var countBits;
        var i;
        var codewords = [];
        var padByte = 0xEC;
        var blocks = [];
        var finalCodewords = [];
        var offset = 0;
        var shortBlockLength;
        var longBlocks;
        var length;
        var dataBlock;
        var ecBlock;
        var maxDataLength = 0;
        var selectedVersion;

        for (version = 1; version < QR_M_TABLE.length; version += 1) {
            table = QR_M_TABLE[version];
            dataCodewords = table.total - table.ec * table.blocks;
            countBits = version < 10 ? 8 : 16;
            if (bytes.length < (1 << countBits) && 4 + countBits + bytes.length * 8 <= dataCodewords * 8) {
                break;
            }
        }

        if (version >= QR_M_TABLE.length) {
            throw new Error('OTP QR is too long');
        }

        selectedVersion = version;
        table = QR_M_TABLE[version];
        dataCodewords = table.total - table.ec * table.blocks;
        capacityBits = dataCodewords * 8;
        countBits = version < 10 ? 8 : 16;
        bits = [];

        appendQrBits(bits, 0x4, 4);
        appendQrBits(bits, bytes.length, countBits);
        for (i = 0; i < bytes.length; i += 1) {
            appendQrBits(bits, bytes[i], 8);
        }
        appendQrBits(bits, 0, Math.min(4, capacityBits - bits.length));

        while (bits.length % 8 !== 0) {
            bits.push(0);
        }

        for (i = 0; i < bits.length; i += 8) {
            codewords.push((bits[i] << 7) | (bits[i + 1] << 6) | (bits[i + 2] << 5) | (bits[i + 3] << 4) |
                (bits[i + 4] << 3) | (bits[i + 5] << 2) | (bits[i + 6] << 1) | bits[i + 7]);
        }

        while (codewords.length < dataCodewords) {
            codewords.push(padByte);
            padByte ^= 0xFD;
        }

        shortBlockLength = Math.floor(dataCodewords / table.blocks);
        longBlocks = dataCodewords % table.blocks;

        for (i = 0; i < table.blocks; i += 1) {
            length = shortBlockLength + (i >= table.blocks - longBlocks ? 1 : 0);
            dataBlock = codewords.slice(offset, offset + length);
            offset += length;
            ecBlock = reedSolomonRemainder(dataBlock, table.ec);
            blocks.push({ data: dataBlock, ec: ecBlock });
            maxDataLength = Math.max(maxDataLength, dataBlock.length);
        }

        for (i = 0; i < maxDataLength; i += 1) {
            for (version = 0; version < blocks.length; version += 1) {
                if (i < blocks[version].data.length) {
                    finalCodewords.push(blocks[version].data[i]);
                }
            }
        }

        for (i = 0; i < table.ec; i += 1) {
            for (version = 0; version < blocks.length; version += 1) {
                finalCodewords.push(blocks[version].ec[i]);
            }
        }

        return {
            codewords: finalCodewords,
            versionNumber: selectedVersion
        };
    }

    function qrSvgFromModules(modules) {
        var size = modules.length;
        var border = 4;
        var path = '';
        var y;
        var x;

        for (y = 0; y < size; y += 1) {
            for (x = 0; x < size; x += 1) {
                if (modules[y][x]) {
                    path += 'M' + (x + border) + ',' + (y + border) + 'h1v1h-1z';
                }
            }
        }

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (size + border * 2) + ' ' + (size + border * 2) + '" role="img" aria-label="OTP QR code">' +
            '<rect width="100%" height="100%" fill="#fff"/><path d="' + path + '" fill="#000"/></svg>';
    }

    function renderQrSvg(text) {
        var encoded = qrCodewords(text);
        var base = drawQrFunctionPatterns(encoded.versionNumber);
        var bestModules = null;
        var bestPenalty = null;
        var modules;
        var mask;
        var penalty;

        for (mask = 0; mask < 8; mask += 1) {
            modules = cloneQrMatrix(base.modules);
            placeQrData(modules, base.reserved, encoded.codewords, mask);
            drawQrFormat(modules, qrMatrix(modules.length, false), mask);
            drawQrVersion(modules, qrMatrix(modules.length, false), encoded.versionNumber);
            penalty = qrPenalty(modules);

            if (bestPenalty === null || penalty < bestPenalty) {
                bestPenalty = penalty;
                bestModules = modules;
            }
        }

        return qrSvgFromModules(bestModules);
    }

    function buildOtpQrValue(source, title, username) {
        var config = parseOtpConfig(source);
        var label;

        if (!config) {
            throw new Error('OTP is empty');
        }

        base32ToBytes(config.secret);

        if (config.isUri) {
            return config.raw;
        }

        label = 'SimplyPass:' + (title || username || 'OTP');
        return 'otpauth://totp/' + encodeURIComponent(label) + '?secret=' + encodeURIComponent(config.secret) + '&issuer=SimplyPass&algorithm=SHA1&digits=6&period=30';
    }

    function setOtpQrMessage($message, text, isError) {
        if (!$message || !$message.length) {
            return;
        }

        $message.text(text || '').toggleClass('error', !!isError);
    }

    function validateOtpQrText(text) {
        var value = String(text || '').trim();
        var config = parseOtpConfig(value);

        if (!config) {
            throw new Error('QR не содержит OTP.');
        }

        base32ToBytes(config.secret);
        return value;
    }

    function isMobileCameraScanAvailable() {
        var isSmallScreen = window.matchMedia ? window.matchMedia('(max-width: 899px)').matches : window.innerWidth < 900;
        var hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

        return isSmallScreen && hasTouch && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    }

    function loadHtml5QrcodeLibrary() {
        var deferred;
        var script;

        if (window.Html5Qrcode) {
            return resolved(window.Html5Qrcode);
        }

        if (html5QrcodeLoadPromise) {
            return html5QrcodeLoadPromise;
        }

        deferred = $.Deferred();
        script = document.createElement('script');
        script.src = 'html5-qrcode.min.js?2.3.8';
        script.async = true;
        if (HTML5_QRCODE_SRI) {
            script.integrity = HTML5_QRCODE_SRI;
            script.crossOrigin = 'anonymous';
        }
        script.onload = function () {
            if (window.Html5Qrcode) {
                checkAssetIntegrity('html5-qrcode.min.js', 'html5-qrcode.min.js?2.3.8').then(function (changedName) {
                    if (changedName) {
                        showIntegrityWarning([changedName]);
                    }
                });
                deferred.resolve(window.Html5Qrcode);
                return;
            }

            deferred.reject(new Error('Библиотека html5-qrcode не загружена.'));
        };
        script.onerror = function () {
            deferred.reject(new Error('Не удалось загрузить библиотеку камеры.'));
        };

        html5QrcodeLoadPromise = deferred.promise();
        document.getElementsByTagName('head')[0].appendChild(script);
        return html5QrcodeLoadPromise;
    }

    function ensureOtpCameraModal() {
        if ($('#otpCameraModal').length) {
            return;
        }

        $('body').append(
            '<div class="camera-modal" id="otpCameraModal" aria-hidden="true">' +
            '<div class="camera-modal-card" role="dialog" aria-modal="true">' +
            '<div class="camera-modal-header">' +
            '<div class="camera-modal-title">Сканирование OTP QR</div>' +
            '<button type="button" class="camera-close-btn js-close-otp-camera">Закрыть</button>' +
            '</div>' +
            '<div class="camera-reader" id="otpCameraReader"></div>' +
            '<div class="camera-message" id="otpCameraMessage"></div>' +
            '</div>' +
            '</div>'
        );
    }

    function stopOtpCameraScan() {
        var scanner = otpCameraScanner;
        var stopPromise;

        otpCameraScanner = null;
        $('#otpCameraModal').removeClass('show').attr('aria-hidden', 'true');

        if (!scanner) {
            return resolved();
        }

        try {
            stopPromise = scanner.isScanning ? scanner.stop() : Promise.resolve();
        } catch (ignore) {
            stopPromise = Promise.resolve();
        }

        return fromNativePromise(stopPromise).always(function () {
            if (scanner.clear) {
                try {
                    scanner.clear();
                } catch (ignore) {}
            }
        });
    }

    function cameraScanConfig() {
        var formats = window.Html5QrcodeSupportedFormats ? [window.Html5QrcodeSupportedFormats.QR_CODE] : undefined;

        return {
            fps: 10,
            qrbox: function (viewfinderWidth, viewfinderHeight) {
                var minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                var size = Math.max(180, Math.floor(minEdge * 0.72));

                return { width: size, height: size };
            },
            aspectRatio: 1,
            disableFlip: false,
            formatsToSupport: formats,
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true
            }
        };
    }

    function startOtpCameraScan($field, $message) {
        var scanner;

        if (!isMobileCameraScanAvailable()) {
            setOtpQrMessage($message, 'Камера доступна только на мобильном устройстве.', true);
            return;
        }

        ensureOtpCameraModal();
        stopOtpCameraScan();
        otpCameraTargetField = $field;
        otpCameraTargetMessage = $message;
        $('#otpCameraMessage').removeClass('error').text('Наведи камеру на QR-код.');
        $('#otpCameraModal').addClass('show').attr('aria-hidden', 'false');

        loadHtml5QrcodeLibrary().then(function () {
            try {
                scanner = new window.Html5Qrcode('otpCameraReader', {
                    formatsToSupport: window.Html5QrcodeSupportedFormats ? [window.Html5QrcodeSupportedFormats.QR_CODE] : undefined
                });
                otpCameraScanner = scanner;

                fromNativePromise(scanner.start(
                    { facingMode: 'environment' },
                    cameraScanConfig(),
                    function (decodedText) {
                        var otp;

                        try {
                            otp = validateOtpQrText(decodedText);
                        } catch (error) {
                            $('#otpCameraMessage').addClass('error').text('QR найден, но это не OTP.');
                            return;
                        }

                        if (otpCameraTargetField && otpCameraTargetField.length) {
                            otpCameraTargetField.val(otp).trigger('input');
                        }

                        setOtpQrMessage(otpCameraTargetMessage, 'QR прочитан.', false);
                        stopOtpCameraScan();
                    },
                    function () {}
                )).then(null, function (error) {
                    $('#otpCameraMessage').addClass('error').text('Не удалось открыть камеру.');
                    setOtpQrMessage($message, error && error.message ? error.message : 'Не удалось открыть камеру.', true);
                });
            } catch (error) {
                $('#otpCameraMessage').addClass('error').text(error.message || 'Не удалось открыть камеру.');
                setOtpQrMessage($message, error.message || 'Не удалось открыть камеру.', true);
            }
        }, function (error) {
            $('#otpCameraMessage').addClass('error').text(error.message || 'Не удалось открыть камеру.');
            setOtpQrMessage($message, error.message || 'Не удалось открыть камеру.', true);
        });
    }

    function ensureOtpQrModal() {
        if ($('#otpQrModal').length) {
            return;
        }

        $('body').append(
            '<div class="qr-modal" id="otpQrModal" aria-hidden="true">' +
            '<div class="qr-modal-card" role="dialog" aria-modal="true">' +
            '<div class="qr-modal-header">' +
            '<div class="qr-modal-title" id="otpQrTitle">OTP QR</div>' +
            '<button type="button" class="qr-close-btn js-close-otp-qr">Закрыть</button>' +
            '</div>' +
            '<div class="qr-code-wrap" id="otpQrCode"></div>' +
            '</div>' +
            '</div>'
        );
    }

    function closeOtpQrModal() {
        $('#otpQrModal').removeClass('show').attr('aria-hidden', 'true');
    }

    function closeSettingsDropdown() {
        $('#settingsDropdown').removeClass('open');
        $('#settingsDropdownToggle').attr('aria-expanded', 'false');
    }

    function toggleSettingsDropdown(event) {
        var isOpen;

        if (event) {
            event.stopPropagation();
        }

        isOpen = $('#settingsDropdown').hasClass('open');
        $('#settingsDropdown').toggleClass('open', !isOpen);
        $('#settingsDropdownToggle').attr('aria-expanded', isOpen ? 'false' : 'true');
    }

    function showOtpQr($button) {
        var $field = $button.closest('.otp-card-field');
        var source = $field.attr('data-otp-source') || '';
        var title = $field.attr('data-otp-title') || '';
        var username = $field.attr('data-otp-username') || '';
        var qrValue;

        try {
            qrValue = buildOtpQrValue(source, title, username);
            ensureOtpQrModal();
            $('#otpQrTitle').text(title || 'OTP QR');
            $('#otpQrCode').html(renderQrSvg(qrValue));
            $('#otpQrModal').addClass('show').attr('aria-hidden', 'false');
        } catch (error) {
            alert('Не удалось создать QR: ' + error.message);
        }
    }

    function updateOtpCards() {
        var now = Date.now();
        var hideOtp = $('#hideOtp').prop('checked');

        $('.js-otp-code').each(function () {
            var $code = $(this);
            var source = $code.attr('data-otp-source') || '';
            var $field = $code.closest('.otp-card-field');

            generateTotp(source, now).then(function (result) {
                if (($code.attr('data-otp-source') || '') !== source) {
                    return;
                }

                $code.text(hideOtp ? hiddenFieldText(result.code) : result.display);
                $code.toggleClass('card-hidden-value', hideOtp);
                $field.find('.js-otp-remaining').text(result.remaining + 'с');
                $field.find('.js-otp-copy').attr('data-val', result.code);
            }, function () {
                $code.text('Неверная OTP строка');
                $code.removeClass('card-hidden-value');
                $field.find('.js-otp-remaining').text('');
                $field.find('.js-otp-copy').attr('data-val', '');
            });
        });
    }

    function startOtpTimer() {
        if (otpUpdateTimer) {
            return;
        }

        otpUpdateTimer = window.setInterval(updateOtpCards, 1000);
    }

    function getGroupById(id) {
        var i;

        for (i = 0; i < decryptedGroupsCache.length; i += 1) {
            if (decryptedGroupsCache[i].id === id) {
                return decryptedGroupsCache[i];
            }
        }

        return null;
    }

    function getPasswordById(id) {
        var i;

        for (i = 0; i < decryptedDataCache.length; i += 1) {
            if (decryptedDataCache[i].id === id) {
                return decryptedDataCache[i];
            }
        }

        return null;
    }

    function normalizeEncryptedGroup(record) {
        var normalized;

        if (!record) {
            debugLog('normalize.group.skip.empty');
            return null;
        }

        normalized = {
            id: parseInt(record.id, 10),
            ciphertext: record.ciphertext,
            iv: record.iv,
            kdf_iterations: parseInt(record.kdf_iterations, 10),
            kdf_salt: record.kdf_salt,
            sort_order: parseInt(record.sort_order, 10) || 0,
            created_at: parseInt(record.created_at, 10) || 0,
            updated_at: parseInt(record.updated_at, 10) || 0
        };

        debugLog('normalize.group', {
            raw: debugRecordMeta(record),
            normalized: debugRecordMeta(normalized)
        });

        return normalized;
    }

    function normalizeEncryptedPassword(record) {
        var normalized;

        if (!record) {
            debugLog('normalize.password.skip.empty');
            return null;
        }

        normalized = {
            id: parseInt(record.id, 10),
            group_id: record.group_id ? parseInt(record.group_id, 10) : null,
            ciphertext: record.ciphertext,
            iv: record.iv,
            kdf_iterations: parseInt(record.kdf_iterations, 10),
            kdf_salt: record.kdf_salt,
            is_favorite: parseInt(record.is_favorite, 10) === 1 ? 1 : 0,
            created_at: parseInt(record.created_at, 10) || 0,
            updated_at: parseInt(record.updated_at, 10) || 0
        };

        debugLog('normalize.password', {
            raw: debugRecordMeta(record),
            normalized: debugRecordMeta(normalized)
        });

        return normalized;
    }

    function upsertEncryptedGroup(record) {
        var normalized = normalizeEncryptedGroup(record);
        var i;

        if (!normalized || !normalized.id) {
            debugLog('upsert.group.skip.invalid', {
                raw: debugRecordMeta(record)
            });
            return false;
        }

        for (i = 0; i < dbGroups.length; i += 1) {
            if (parseInt(dbGroups[i].id, 10) === normalized.id) {
                dbGroups[i] = normalized;
                debugLog('upsert.group.update', {
                    group: debugRecordMeta(normalized),
                    groupCount: dbGroups.length
                });
                return true;
            }
        }

        dbGroups.push(normalized);
        debugLog('upsert.group.insert', {
            group: debugRecordMeta(normalized),
            groupCount: dbGroups.length
        });
        return true;
    }

    function upsertEncryptedPassword(record) {
        var normalized = normalizeEncryptedPassword(record);
        var i;

        if (!normalized || !normalized.id) {
            debugLog('upsert.password.skip.invalid', {
                raw: debugRecordMeta(record)
            });
            return false;
        }

        for (i = 0; i < dbPasswords.length; i += 1) {
            if (parseInt(dbPasswords[i].id, 10) === normalized.id) {
                dbPasswords[i] = normalized;
                debugLog('upsert.password.update', {
                    password: debugRecordMeta(normalized),
                    passwordCount: dbPasswords.length
                });
                return true;
            }
        }

        dbPasswords.unshift(normalized);
        debugLog('upsert.password.insert', {
            password: debugRecordMeta(normalized),
            passwordCount: dbPasswords.length
        });
        return true;
    }

    function renderSavedGroup(response) {
        debugLog('render.saved.group.start', debugApiResponse(response));

        if (response && upsertEncryptedGroup(response.group)) {
            saveLocalEncryptedData();
            return processAndRender();
        }

        debugLog('render.saved.group.fallback.fetch');
        return fetchData();
    }

    function renderSavedPassword(response) {
        debugLog('render.saved.password.start', debugApiResponse(response));

        if (response && upsertEncryptedPassword(response.password)) {
            saveLocalEncryptedData();
            return processAndRender();
        }

        debugLog('render.saved.password.fallback.fetch');
        return fetchData();
    }

    function renderTabs() {
        var html = '';
        var group;
        var isActive;
        var i;

        html += '<div class="tab js-group-tab' + (activeGroupId === null ? ' active' : '') + '" data-group-id="">Все</div>';

        for (i = 0; i < decryptedGroupsCache.length; i += 1) {
            group = decryptedGroupsCache[i];
            isActive = activeGroupId === group.id;

            html += '<div class="tab-item" data-group-id="' + group.id + '">';
            html += '<div class="tab js-group-tab' + (isActive ? ' active' : '') + '" data-group-id="' + group.id + '">';
            html += escapeHTML(group.name);
            html += '</div>';

            if (isActive) {
                html += '<div class="tab-controls">';
                if (group.isDecrypted) {
                    html += '<button type="button" class="tab-btn js-edit-group" data-id="' + group.id + '" title="Редактировать" aria-label="Редактировать">✏️</button>';
                }
                html += '<button type="button" class="tab-btn js-delete-group" data-id="' + group.id + '" title="Удалить" aria-label="Удалить">❌</button>';
                html += '</div>';
            }

            html += '</div>';
        }

        html += '<div class="tab tab-add js-create-group">+ Создать группу</div>';
        $('#tabsListDesktop, #tabsListMobile').html(html);
        debugLog('ui.tabs.render', {
            groups: decryptedGroupsCache.length,
            decryptedGroups: countDecryptedItems(decryptedGroupsCache),
            activeGroupId: activeGroupId
        });
    }

    function groupOptionsHTML(selectedId, rootLabel) {
        var normalizedSelectedId = selectedId ? parseInt(selectedId, 10) : null;
        var html = '<option value=""' + (normalizedSelectedId === null ? ' selected' : '') + '>' + escapeHTML(rootLabel || 'Без группы') + '</option>';
        var i;
        var group;
        var groupId;

        for (i = 0; i < decryptedGroupsCache.length; i += 1) {
            group = decryptedGroupsCache[i];
            groupId = parseInt(group.id, 10);
            html += '<option value="' + groupId + '"' + (normalizedSelectedId === groupId ? ' selected' : '') + '>' + escapeHTML(group.name) + '</option>';
        }

        return html;
    }

    function updateSelectOptions() {
        var $select = $('#formGroup');
        var currentValue = $select.val();
        var html = groupOptionsHTML(currentValue, 'Все (Без группы)');

        $select.html(html).val(currentValue);
        debugLog('ui.select-options.render', {
            groups: decryptedGroupsCache.length,
            currentValue: currentValue || null
        });
    }

    function getGroupName(id) {
        var group = getGroupById(id);
        return group ? group.name : 'Все';
    }

    function hiddenFieldText(value) {
        var lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
        var hiddenLines = [];
        var i;

        for (i = 0; i < lines.length; i += 1) {
            hiddenLines.push(lines[i] ? '********' : '');
        }

        return hiddenLines.join('\n');
    }

    function fieldTextToHTML(value) {
        return escapeHTML(value).replace(/\r\n|\r|\n/g, '<br>');
    }

    function renderCardField(label, value, className, isHidden) {
        var fieldValueClass = className || 'card-field-value';
        var safeValue = escapeHTML(value);
        var plainHTML = fieldTextToHTML(value);
        var maskHTML = fieldTextToHTML(hiddenFieldText(value));
        var eyeGlyph = isHidden ? '⊘' : '⊙';
        var eyeClass = 'field-eye-btn js-toggle-field-visibility' + (isHidden ? '' : ' eye-open');
        var html = '';

        if (isHidden) {
            fieldValueClass += ' card-hidden-value';
        }

        html += '<div class="card-field">';
        html += '<div class="card-field-top">';
        html += '<span class="card-field-label">' + label + '</span>';
        html += '<button type="button" class="' + eyeClass + '" aria-label="Показать/скрыть">' + eyeGlyph + '</button>';
        html += '<button type="button" class="copy-btn js-copy" data-val="' + safeValue + '">📋 Копировать</button>';
        html += '</div>';
        html += '<div class="' + fieldValueClass + '">';
        html += '<span class="field-value-mask' + (isHidden ? '' : ' field-hidden') + '">' + maskHTML + '</span>';
        html += '<span class="field-value-plain' + (isHidden ? ' field-hidden' : '') + '">' + plainHTML + '</span>';
        html += '</div>';
        html += '</div>';

        return html;
    }

    function renderOtpCardField(data) {
        var otp = data.payload.otp || '';
        var html = '';

        if (!otp || !data.isDecrypted) {
            return '';
        }

        html += '<div class="card-field otp-card-field" data-otp-source="' + escapeHTML(otp) + '" data-otp-title="' + escapeHTML(data.payload.title || '') + '" data-otp-username="' + escapeHTML(data.payload.username || '') + '">';
        html += '<div class="card-field-top">';
        html += '<span class="card-field-label">OTP</span>';
        html += '<button type="button" class="copy-btn js-copy js-otp-copy" data-val="">📋 Копировать</button>';
        html += '<button type="button" class="qr-btn js-otp-qr">qrcode</button>';
        html += '</div>';
        html += '<div class="card-field-value otp-value"><span class="js-otp-code" data-otp-source="' + escapeHTML(otp) + '">...</span><span class="otp-remaining js-otp-remaining"></span></div>';
        html += '</div>';

        return html;
    }

    function renderCardEditField(label, fieldName, value, className) {
        var html = '';
        var textareaClass = className || 'card-edit-textarea';

        html += '<div class="card-field card-edit-field">';
        html += '<div class="card-field-top">';
        html += '<span class="card-field-label">' + label + '</span>';
        html += '</div>';
        html += '<textarea class="' + textareaClass + ' js-card-edit-field" data-field="' + fieldName + '" autocomplete="off" autocapitalize="none" spellcheck="false">' + escapeHTML(value || '') + '</textarea>';
        html += '</div>';

        return html;
    }

    function renderOtpEditField(value) {
        var html = '';

        html += '<div class="card-field card-edit-field card-edit-otp-field">';
        html += '<div class="card-field-top">';
        html += '<span class="card-field-label">OTP</span>';
        html += '</div>';
        html += '<textarea class="card-edit-textarea compact-card-edit-textarea js-card-edit-field" data-field="otp" autocomplete="off" autocapitalize="none" spellcheck="false">' + escapeHTML(value || '') + '</textarea>';
        html += '<div class="otp-camera-row">';
        html += '<button type="button" class="otp-camera-btn js-card-otp-camera">Сканировать камерой</button>';
        html += '<span class="otp-camera-note js-card-otp-message"></span>';
        html += '</div>';
        html += '</div>';

        return html;
    }

    function renderPasswordEditCard(data) {
        var html = '';

        html += '<div class="card card-editing" data-id="' + data.id + '" data-group-id="' + (data.groupId || '') + '">';
        html += '<div class="card-header card-edit-header">';
        html += '<div class="card-edit-title-wrap">';
        html += '<label class="card-edit-label">Название / Сервис</label>';
        html += '<textarea class="card-edit-title js-card-edit-field" data-field="title" autocomplete="off" autocapitalize="none" spellcheck="false">' + escapeHTML(data.payload.title || '') + '</textarea>';
        html += '</div>';
        html += '<div class="card-edit-meta">';
        html += '<label class="card-edit-label">Группа</label>';
        html += '<select class="card-edit-group js-card-edit-group">' + groupOptionsHTML(data.groupId, 'Без группы') + '</select>';
        html += '<div class="card-dates">С: ' + formatLocalTime(data.original.created_at) + '<br>И: ' + formatLocalTime(data.original.updated_at) + '</div>';
        html += '</div>';
        html += '</div>';
        html += renderCardEditField('Логин', 'username', data.payload.username, 'card-edit-textarea compact-card-edit-textarea');
        html += renderCardEditField('Пароль', 'password', data.payload.password, 'card-edit-textarea compact-card-edit-textarea');
        html += renderCardEditField('Заметки', 'notes', data.payload.notes, 'card-edit-textarea card-edit-notes');
        html += renderOtpEditField(data.payload.otp);
        html += '<div class="btn-group card-edit-actions">';
        html += '<button type="button" class="edit-btn js-save-inline-password" data-id="' + data.id + '">Сохранить</button>';
        html += '<button type="button" class="delete-btn js-cancel-inline-password" data-id="' + data.id + '">Отмена</button>';
        html += '</div>';
        html += '</div>';

        return html;
    }

    function renderPasswords() {
        var html = '';
        var data;
        var groupName;
        var hidePasswords = $('#hidePasswords').prop('checked');
        var hideUsernames = $('#hideUsernames').prop('checked');
        var hideNotes = $('#hideNotes').prop('checked');
        var i;

        for (i = 0; i < decryptedDataCache.length; i += 1) {
            data = decryptedDataCache[i];

            if (inlineEditId === data.id) {
                html += renderPasswordEditCard(data);
                continue;
            }

            groupName = getGroupName(data.groupId);

            html += '<div class="card" data-id="' + data.id + '" data-group-id="' + (data.groupId || '') + '">';
            html += '<div class="card-header">';
            html += '<div class="card-title">' + escapeHTML(data.payload.title);

            if (data.groupId) {
                html += '<span class="card-group-badge">' + escapeHTML(groupName) + '</span>';
            }

            html += '</div>';
            html += '<div class="card-meta-right">';
            html += '<div class="card-dates">С: ' + formatLocalTime(data.original.created_at) + '<br>И: ' + formatLocalTime(data.original.updated_at) + '</div>';
            html += '<button type="button" class="favorite-btn js-toggle-favorite' + (data.original.is_favorite ? ' active' : '') + '" data-id="' + data.id + '" title="В избранное" aria-label="В избранное">★</button>';
            html += '</div>';
            html += '</div>';
            html += renderCardField('Логин', data.payload.username, null, hideUsernames);
            html += renderCardField('Пароль', data.payload.password, null, hidePasswords);

            if (data.payload.notes) {
                html += renderCardField('Заметки', data.payload.notes, 'card-notes-value', hideNotes);
            }

            html += renderOtpCardField(data);

            html += '<div class="btn-group">';
            html += '<button type="button" class="edit-btn js-edit-password" data-id="' + data.id + '">Редактировать</button>';
            html += '<button type="button" class="delete-btn js-delete-password" data-id="' + data.id + '">Удалить</button>';
            html += '</div>';
            html += '</div>';
        }

        $('#passwordsList').html(html);
        updateOtpCards();
        filterCards();
        debugLog('ui.passwords.render', {
            passwords: decryptedDataCache.length,
            decryptedPasswords: countDecryptedItems(decryptedDataCache),
            activeGroupId: activeGroupId
        });
    }

    function selectGroup(id) {
        activeGroupId = id;
        renderTabs();
        filterCards();
    }

    function filterCards() {
        var $visibleSearchInput = $('.js-search-input:visible').first();
        var query = String(($visibleSearchInput.length ? $visibleSearchInput.val() : $('.js-search-input').first().val()) || '').toLowerCase();

        $('#passwordsList .card').each(function () {
            var $card = $(this);
            var id = parseInt($card.attr('data-id'), 10);
            var groupAttr = $card.attr('data-group-id');
            var groupId = groupAttr ? parseInt(groupAttr, 10) : null;
            var data = getPasswordById(id);
            var searchableText;
            var matchGroup;
            var matchSearch;

            if (!data) {
                return;
            }

            searchableText = String(data.payload.title + ' ' + data.payload.username + ' ' + data.payload.notes + ' ' + (data.payload.otp || '')).toLowerCase();
            matchGroup = activeGroupId === null || activeGroupId === groupId;
            matchSearch = !query || searchableText.indexOf(query) !== -1;
            $card.toggle(matchGroup && matchSearch);
        });
        debugLog('ui.cards.filter', {
            queryLen: query.length,
            activeGroupId: activeGroupId,
            cards: $('#passwordsList .card').length,
            visibleCards: $('#passwordsList .card:visible').length
        });
    }

    function createGroup() {
        var masterKey = $('#masterKey').val();
        var name;

        if (!masterKey) {
            debugLog('group.create.block.no-key');
            alert('Сначала введите мастер-ключ!');
            return;
        }

        name = prompt('Название новой вкладки (группы):');
        if (!name) {
            debugLog('group.create.cancel');
            return;
        }

        debugLog('group.create.start', {
            key: debugKeyLabel(masterKey),
            nameLen: name.length,
            existingGroups: dbGroups.length
        });

        encryptData(JSON.stringify({ name: name }), masterKey).then(function (encrypted) {
            debugLog('group.create.encrypted', {
                key: debugKeyLabel(masterKey),
                encrypted: debugRecordMeta(encrypted)
            });

            return apiCall(addEncryptionFields({
                action: 'save_group'
            }, encrypted));
        }).then(function (response) {
            return renderSavedGroup(response);
        }, function (error) {
            alert('Ошибка: ' + error.message);
        });
    }

    function editGroup(event, id) {
        var group = getGroupById(id);
        var masterKey = $('#masterKey').val();
        var name;

        event.stopPropagation();

        if (!group) {
            return;
        }

        name = prompt('Изменить название:', group.name);
        if (!name || name === group.name) {
            debugLog('group.edit.cancel', {
                id: id,
                sameName: name === group.name
            });
            return;
        }

        debugLog('group.edit.start', {
            key: debugKeyLabel(masterKey),
            id: id,
            nameLen: name.length
        });

        encryptData(JSON.stringify({ name: name }), masterKey).then(function (encrypted) {
            debugLog('group.edit.encrypted', {
                key: debugKeyLabel(masterKey),
                id: id,
                encrypted: debugRecordMeta(encrypted)
            });

            return apiCall(addEncryptionFields({
                action: 'save_group',
                id: id
            }, encrypted));
        }).then(function (response) {
            return renderSavedGroup(response);
        }, function (error) {
            alert('Ошибка: ' + error.message);
        });
    }

    function deleteGroup(event, id) {
        event.stopPropagation();

        if (!confirm("Удалить вкладку? Пароли, привязанные к ней, перенесутся в раздел 'Все'.")) {
            return;
        }

        apiCall({ action: 'delete_group', id: id }).then(function () {
            activeGroupId = null;
            return fetchData();
        }, function (error) {
            alert('Ошибка: ' + error.message);
        });
    }

    function reorderItemsById(items, idOrder) {
        var byId = {};
        var i;
        var key;
        var result = [];

        for (i = 0; i < items.length; i += 1) {
            byId[items[i].id] = items[i];
        }
        for (i = 0; i < idOrder.length; i += 1) {
            if (byId[idOrder[i]]) {
                result.push(byId[idOrder[i]]);
                delete byId[idOrder[i]];
            }
        }
        for (key in byId) {
            if (Object.prototype.hasOwnProperty.call(byId, key)) {
                result.push(byId[key]);
            }
        }
        return result;
    }

    function handleTabsReorder(evt) {
        var container = evt.from;
        var items = container.querySelectorAll('.tab-item[data-group-id]');
        var newOrder = [];
        var id;
        var i;

        for (i = 0; i < items.length; i += 1) {
            id = parseInt(items[i].getAttribute('data-group-id'), 10);
            if (id > 0) {
                newOrder.push(id);
            }
        }

        if (newOrder.length === 0) {
            return;
        }

        decryptedGroupsCache = reorderItemsById(decryptedGroupsCache, newOrder);
        dbGroups = reorderItemsById(dbGroups, newOrder);
        renderTabs();

        apiCall({ action: 'reorder_groups', order: newOrder }).then(null, function (error) {
            alert('Ошибка сохранения порядка: ' + error.message);
            fetchData();
        });
    }

    function initTabsSortable() {
        if (!window.Sortable) {
            return;
        }

        var options = {
            draggable: '.tab-item',
            animation: 150,
            delay: 300,
            delayOnTouchOnly: true,
            onMove: function (evt) {
                return !!(evt.related && evt.related.classList && evt.related.classList.contains('tab-item'));
            },
            onEnd: handleTabsReorder
        };

        var desktop = document.getElementById('tabsListDesktop');
        var mobile = document.getElementById('tabsListMobile');
        if (desktop) {
            window.Sortable.create(desktop, options);
        }
        if (mobile) {
            window.Sortable.create(mobile, options);
        }
    }

    function editPassword(id) {
        var data = getPasswordById(id);

        if (!data || !data.isDecrypted) {
            alert('Требуется мастер-ключ!');
            return;
        }

        resetForm(true);
        inlineEditId = data.id;
        renderPasswords();
    }

    function cancelInlineEdit() {
        inlineEditId = null;
        renderPasswords();
    }

    function saveInlinePassword(id) {
        var masterKey = $('#masterKey').val();
        var data = getPasswordById(id);
        var $card = $('#passwordsList .card[data-id="' + id + '"]');
        var payload = {};
        var groupId;

        if (!masterKey) {
            alert('Введите мастер-ключ!');
            return;
        }

        if (!data || !data.isDecrypted || !$card.length) {
            alert('Требуется мастер-ключ!');
            return;
        }

        $card.find('.js-card-edit-field').each(function () {
            payload[$(this).attr('data-field')] = $(this).val();
        });

        if (!payload.title) {
            alert('Укажите Название!');
            return;
        }

        groupId = $card.find('.js-card-edit-group').val();
        $card.find('.js-save-inline-password').prop('disabled', true);
        debugLog('password.inline-save.start', {
            key: debugKeyLabel(masterKey),
            id: id,
            groupId: groupId || null,
            titleLen: String(payload.title || '').length,
            usernameLen: String(payload.username || '').length,
            passwordLen: String(payload.password || '').length,
            notesLen: String(payload.notes || '').length,
            otpLen: String(payload.otp || '').length
        });

        encryptData(JSON.stringify({
            title: payload.title,
            username: payload.username || '',
            password: payload.password || '',
            notes: payload.notes || '',
            otp: payload.otp || ''
        }), masterKey).then(function (encrypted) {
            debugLog('password.inline-save.encrypted', {
                key: debugKeyLabel(masterKey),
                encrypted: debugRecordMeta(encrypted)
            });

            return apiCall(addEncryptionFields({
                action: 'save_password',
                id: id,
                group_id: groupId ? parseInt(groupId, 10) : null
            }, encrypted));
        }).then(function (response) {
            inlineEditId = null;
            return renderSavedPassword(response);
        }, function (error) {
            alert('Ошибка: ' + error.message);
        }).always(function () {
            $card.find('.js-save-inline-password').prop('disabled', false);
        });
    }

    function deletePassword(id) {
        if (!confirm('Удалить запись?')) {
            return;
        }

        apiCall({ action: 'delete_password', id: id }).then(function () {
            return fetchData();
        }, function (error) {
            alert('Ошибка: ' + error.message);
        });
    }

    function toggleFavorite(id) {
        var i;
        var current = 0;

        for (i = 0; i < dbPasswords.length; i += 1) {
            if (parseInt(dbPasswords[i].id, 10) === id) {
                current = dbPasswords[i].is_favorite ? 1 : 0;
                break;
            }
        }

        var next = current ? 0 : 1;

        apiCall({ action: 'toggle_favorite', id: id, is_favorite: next }).then(function () {
            return fetchData();
        }, function (error) {
            alert('Ошибка: ' + error.message);
        });
    }

    function savePassword() {
        var masterKey = $('#masterKey').val();
        var title = $('#formTitleField').val();
        var payload;

        if (!masterKey) {
            alert('Введите мастер-ключ!');
            return;
        }

        if (!title) {
            alert('Укажите Название!');
            return;
        }

        payload = JSON.stringify({
            title: title,
            username: $('#formUsername').val(),
            password: $('#formPassword').val(),
            notes: $('#formNotes').val(),
            otp: $('#formOtp').val()
        });

        $('#saveBtn').prop('disabled', true);
        debugLog('password.save.start', {
            key: debugKeyLabel(masterKey),
            editId: $('#editId').val() || null,
            groupId: $('#formGroup').val() || null,
            titleLen: String(title || '').length,
            usernameLen: String($('#formUsername').val() || '').length,
            passwordLen: String($('#formPassword').val() || '').length,
            notesLen: String($('#formNotes').val() || '').length,
            otpLen: String($('#formOtp').val() || '').length
        });

        encryptData(payload, masterKey).then(function (encrypted) {
            var id = $('#editId').val();
            var groupId = $('#formGroup').val();

            debugLog('password.save.encrypted', {
                key: debugKeyLabel(masterKey),
                encrypted: debugRecordMeta(encrypted)
            });

            return apiCall(addEncryptionFields({
                action: 'save_password',
                id: id ? parseInt(id, 10) : null,
                group_id: groupId ? parseInt(groupId, 10) : null
            }, encrypted));
        }).then(function (response) {
            resetForm();
            return renderSavedPassword(response);
        }, function (error) {
            alert('Ошибка: ' + error.message);
        }).always(function () {
            $('#saveBtn').prop('disabled', false);
        });
    }

    function resetForm(keepInlineEdit) {
        if (!keepInlineEdit) {
            inlineEditId = null;
        }
        $('#editId').val('');
        $('#formGroup').val(activeGroupId || '');
        $('#formTitleField').val('');
        $('#formUsername').val('');
        $('#formPassword').val('');
        $('#formNotes').val('');
        $('#formOtp').val('');
        $('#formTitle').text('Добавить пароль');
        $('#cancelBtn').hide();
        $('#sidePanel').removeClass('edit-mode');
    }

    function showToast() {
        $('#toast').addClass('show');
        window.setTimeout(function () {
            $('#toast').removeClass('show');
        }, 2000);
    }

    function fallbackCopy(text) {
        var $input = $('<textarea readonly></textarea>');
        var copied = false;

        $input.css({
            position: 'fixed',
            left: '-9999px',
            top: '0'
        }).val(text).appendTo('body').select();

        try {
            copied = document.execCommand('copy');
        } catch (ignore) {}

        $input.remove();
        return copied;
    }

    function copyText($button) {
        var text = $button.attr('data-val');

        if (!text || text.indexOf('[Зашифровано]') !== -1 || text === '***' || text.indexOf('[Неверный ключ]') !== -1) {
            return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            fromNativePromise(navigator.clipboard.writeText(text)).then(function () {
                showToast();
            }, function () {
                if (fallbackCopy(text)) {
                    showToast();
                    return;
                }

                alert('Не удалось скопировать.');
            });
            return;
        }

        if (fallbackCopy(text)) {
            showToast();
            return;
        }

        alert('Не удалось скопировать.');
    }

    function exportJSON() {
        var masterKey = $('#masterKey').val();
        var exportedGroups = [];
        var exportedPasswords = [];
        var dataUrl;
        var link;
        var i;
        var data;

        if (!masterKey) {
            alert('Для выгрузки введите мастер-ключ и дождитесь расшифровки данных.');
            return;
        }

        for (i = 0; i < decryptedGroupsCache.length; i += 1) {
            exportedGroups.push({
                id: decryptedGroupsCache[i].id,
                name: decryptedGroupsCache[i].name
            });
        }

        for (i = 0; i < decryptedDataCache.length; i += 1) {
            data = decryptedDataCache[i];
            exportedPasswords.push({
                id: data.id,
                group_name: getGroupName(data.groupId),
                title: data.payload.title,
                username: data.payload.username,
                password: data.payload.password,
                notes: data.payload.notes,
                otp: data.payload.otp || '',
                created_at: formatLocalTime(data.original.created_at),
                updated_at: formatLocalTime(data.original.updated_at)
            });
        }

        dataUrl = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({
            export_date: new Date().toISOString(),
            groups: exportedGroups,
            passwords: exportedPasswords
        }, null, 4));

        link = document.createElement('a');
        link.setAttribute('href', dataUrl);
        link.setAttribute('download', 'passwords_export.json');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function setImportMessage(text, isError) {
        $('#importMessage').text(text || '').toggleClass('error', !!isError);
    }

    function normalizeImportText(value) {
        if (value === null || typeof value === 'undefined') {
            return '';
        }

        return String(value);
    }

    function isRootGroupName(name) {
        return !name || name === 'Все' || name === 'Все (Без группы)';
    }

    function importGroupMap() {
        var map = {};
        var i;
        var group;

        for (i = 0; i < decryptedGroupsCache.length; i += 1) {
            group = decryptedGroupsCache[i];
            if (group && group.isDecrypted && group.name) {
                map[group.name] = group.id;
            }
        }

        return map;
    }

    function uniqueImportGroupNames(payload, existingMap) {
        var names = [];
        var seen = {};
        var groups = payload.groups || [];
        var passwords = payload.passwords || [];
        var i;
        var name;

        for (i = 0; i < groups.length; i += 1) {
            name = normalizeImportText(groups[i] && groups[i].name);
            if (!isRootGroupName(name) && !existingMap[name] && !seen[name]) {
                seen[name] = true;
                names.push(name);
            }
        }

        for (i = 0; i < passwords.length; i += 1) {
            name = normalizeImportText(passwords[i] && passwords[i].group_name);
            if (!isRootGroupName(name) && !existingMap[name] && !seen[name]) {
                seen[name] = true;
                names.push(name);
            }
        }

        return names;
    }

    function createImportedGroups(names, masterKey) {
        var chain = resolved();
        var created = 0;
        var i;

        for (i = 0; i < names.length; i += 1) {
            chain = (function (previous, name) {
                return previous.then(function () {
                    return encryptData(JSON.stringify({ name: name }), masterKey).then(function (encrypted) {
                        return apiCall(addEncryptionFields({
                            action: 'save_group'
                        }, encrypted));
                    }).then(function () {
                        created += 1;
                    });
                });
            }(chain, names[i]));
        }

        return chain.then(function () {
            return created;
        });
    }

    function importPasswordItems(items, groupMap, masterKey) {
        var chain = resolved();
        var imported = 0;
        var i;

        for (i = 0; i < items.length; i += 1) {
            chain = (function (previous, item) {
                return previous.then(function () {
                    var groupName = normalizeImportText(item && item.group_name);
                    var groupId = isRootGroupName(groupName) ? null : (groupMap[groupName] || null);
                    var payload = {
                        title: normalizeImportText(item && item.title),
                        username: normalizeImportText(item && item.username),
                        password: normalizeImportText(item && item.password),
                        notes: normalizeImportText(item && item.notes),
                        otp: normalizeImportText(item && item.otp)
                    };

                    return encryptData(JSON.stringify(payload), masterKey).then(function (encrypted) {
                        return apiCall(addEncryptionFields({
                            action: 'save_password',
                            group_id: groupId
                        }, encrypted));
                    }).then(function () {
                        imported += 1;
                    });
                });
            }(chain, items[i]));
        }

        return chain.then(function () {
            return imported;
        });
    }

    function importJSONPayload(payload) {
        var masterKey = $('#masterKey').val();
        var existingMap;
        var missingGroups;
        var createdGroups = 0;
        var i;

        if (!masterKey) {
            setImportMessage('Введите мастер-ключ перед импортом.', true);
            return rejected(new Error('Введите мастер-ключ перед импортом.'));
        }

        if (!payload || !$.isArray(payload.groups) || !$.isArray(payload.passwords)) {
            setImportMessage('Неверная структура JSON файла.', true);
            return rejected(new Error('Неверная структура JSON файла.'));
        }

        for (i = 0; i < decryptedGroupsCache.length; i += 1) {
            if (!decryptedGroupsCache[i].isDecrypted) {
                setImportMessage('Сначала введите правильный мастер-ключ и дождитесь расшифровки групп.', true);
                return rejected(new Error('Группы не расшифрованы.'));
            }
        }

        setImportMessage('Импорт выполняется...', false);
        $('#importBtn').prop('disabled', true);

        existingMap = importGroupMap();
        missingGroups = uniqueImportGroupNames(payload, existingMap);

        return createImportedGroups(missingGroups, masterKey).then(function (count) {
            createdGroups = count;
            if (createdGroups > 0) {
                return fetchData();
            }
            return processAndRender();
        }).then(function () {
            return importPasswordItems(payload.passwords, importGroupMap(), masterKey);
        }).then(function (importedPasswords) {
            return fetchData().then(function () {
                setImportMessage('Импортировано: групп ' + createdGroups + ', записей ' + importedPasswords + '.', false);
            });
        }, function (error) {
            setImportMessage('Ошибка импорта: ' + error.message, true);
        }).always(function () {
            $('#importBtn').prop('disabled', false);
        });
    }

    function readImportFile(file) {
        var reader;

        if (!file) {
            setImportMessage('Выберите JSON файл.', true);
            return;
        }

        if (!window.FileReader) {
            setImportMessage('Этот браузер не поддерживает чтение файлов через FileReader.', true);
            return;
        }

        reader = new FileReader();
        reader.onload = function (event) {
            var payload;
            try {
                payload = JSON.parse(event.target.result);
            } catch (error) {
                setImportMessage('Не удалось прочитать JSON файл.', true);
                return;
            }

            importJSONPayload(payload);
        };
        reader.onerror = function () {
            setImportMessage('Не удалось прочитать файл.', true);
        };
        reader.readAsText(file, 'UTF-8');
    }

    function importSelectedJSON() {
        readImportFile(importSelectedFile);
    }

    function onImportFileChange() {
        importSelectedFile = this.files && this.files.length ? this.files[0] : null;
        setImportMessage(importSelectedFile ? importSelectedFile.name : '', false);
    }

    function initImportDropzone() {
        var $dropZone = $('#importDropZone');

        if (!window.FileReader || !$dropZone.length) {
            return;
        }

        $dropZone.addClass('supported');
        $dropZone.on('dragenter dragover', function (event) {
            event.preventDefault();
            event.stopPropagation();
            $dropZone.addClass('drag-over');
        });
        $dropZone.on('dragleave dragend', function (event) {
            event.preventDefault();
            event.stopPropagation();
            $dropZone.removeClass('drag-over');
        });
        $dropZone.on('drop', function (event) {
            var original = event.originalEvent;
            var files = original && original.dataTransfer ? original.dataTransfer.files : null;

            event.preventDefault();
            event.stopPropagation();
            $dropZone.removeClass('drag-over');

            if (files && files.length) {
                importSelectedFile = files[0];
                setImportMessage(importSelectedFile.name, false);
                readImportFile(importSelectedFile);
            }
        });
    }

    function isLockedRenderState() {
        var i;

        for (i = 0; i < decryptedDataCache.length; i += 1) {
            if (decryptedDataCache[i].payload && decryptedDataCache[i].payload.title === '[Зашифровано]') {
                return true;
            }
        }

        for (i = 0; i < decryptedGroupsCache.length; i += 1) {
            if (decryptedGroupsCache[i].name === '[Зашифровано]') {
                return true;
            }
        }

        return false;
    }

    function onMasterKeyInput() {
        var masterKey = $('#masterKey').val();
        var lockedState = isLockedRenderState();

        debugLog('master-key.input', {
            key: debugKeyLabel(masterKey),
            previousKey: debugKeyLabel(lastMasterKeyInputValue),
            sameAsPrevious: masterKey === lastMasterKeyInputValue,
            lockedState: lockedState,
            keyChangeVersion: masterKeyChangeVersion
        });

        if (masterKey === lastMasterKeyInputValue && !lockedState) {
            debugLog('master-key.input.skip.same-key');
            return;
        }

        if (masterKey !== lastMasterKeyInputValue) {
            lastMasterKeyInputValue = masterKey;
            masterKeyChangeVersion += 1;
            clearDerivedKeyCache();
            debugLog('master-key.changed', {
                key: debugKeyLabel(masterKey),
                keyChangeVersion: masterKeyChangeVersion
            });
            renderLockedVault();
        }

        if (masterKeyInputTimer) {
            window.clearTimeout(masterKeyInputTimer);
        }

        masterKeyInputTimer = window.setTimeout(function () {
            masterKeyInputTimer = null;
            debugLog('master-key.render.timer', {
                key: debugKeyLabel($('#masterKey').val()),
                keyChangeVersion: masterKeyChangeVersion
            });
            saveKeyToLocalStorage();
            processAndRender();
        }, 300);
    }

    function onVisibilitySettingChange() {
        saveVisibilitySettings();
        renderPasswords();
    }

    function onLocalDataSettingChange() {
        var enabled = isLocalDataStorageEnabled();

        debugLog('offline.setting.change', {
            enabled: enabled,
            passwords: dbPasswords.length,
            groups: dbGroups.length
        });
        saveLocalDataSettings();

        if (enabled) {
            saveLocalEncryptedData();
            loadEncryptedDataFromLocalStorageInstant();
            return;
        }

        removeLocalEncryptedData();
    }

    function onSearchInput() {
        var value = $(this).val();

        $('.js-search-input').not(this).val(value);
        filterCards();
    }

    function setMobileSearchPinned(isPinned, shouldSave) {
        $('#appShell').toggleClass('mobile-search-pinned', isPinned);
        $('#mobileSearchPinBtn')
            .attr('aria-pressed', isPinned ? 'true' : 'false')
            .text(isPinned ? 'Открепить' : 'Закрепить');

        if (shouldSave) {
            localStorage.setItem(LS_MOBILE_SEARCH_PINNED_KEY, isPinned ? '1' : '0');
        }
    }

    function loadMobileSearchPinSetting() {
        setMobileSearchPinned(storedCheckboxValue(LS_MOBILE_SEARCH_PINNED_KEY, true), false);
    }

    function toggleMobileSearchPinned() {
        setMobileSearchPinned(!$('#appShell').hasClass('mobile-search-pinned'), true);
    }

    function setMobileMenuOpen(isOpen) {
        $('#appShell').toggleClass('mobile-menu-open', isOpen);
        $('#mobileMenuToggle')
            .toggleClass('active', isOpen)
            .attr('aria-expanded', isOpen ? 'true' : 'false')
            .text(isOpen ? 'Закрыть меню' : 'Меню управления');
    }

    function toggleMobileMenu() {
        setMobileMenuOpen(!$('#appShell').hasClass('mobile-menu-open'));
    }

    function syncResponsiveBlocks() {
        if ($(window).width() >= 900) {
            setMobileMenuOpen(false);
            $('.mobile-controls').hide();
            $('.desktop-tabs').show();
            $('.desktop-search-group').css('display', 'flex');
            return;
        }

        $('.mobile-controls').show();
        $('.desktop-tabs').hide();
        $('.desktop-search-group').hide();
    }

    function secureRandomInt(max) {
        var cryptoObject = window.crypto || window.msCrypto;
        var values;
        var limit;
        var value;

        if (!cryptoObject || !cryptoObject.getRandomValues) {
            return null;
        }

        values = new Uint32Array(1);
        limit = 4294967296 - (4294967296 % max);

        do {
            cryptoObject.getRandomValues(values);
            value = values[0];
        } while (value >= limit);

        return value % max;
    }

    function selectedPasswordCharsets() {
        var selected = [];

        $('.js-password-charset:checked').each(function () {
            var key = $(this).val();

            if (PASSWORD_CHARSETS[key]) {
                selected.push(PASSWORD_CHARSETS[key]);
            }
        });

        return selected;
    }

    function updatePasswordCharsetLabel() {
        var selected = selectedPasswordCharsets();
        var labels = [];
        var i;

        for (i = 0; i < selected.length; i += 1) {
            labels.push(selected[i].label);
        }

        $('#passwordCharsetToggle').text(labels.length ? labels.join(', ') : 'Выберите символы');
    }

    function uniqueCharsFromString(chars) {
        var result = [];
        var seen = {};
        var i;
        var ch;

        for (i = 0; i < chars.length; i += 1) {
            ch = chars.charAt(i);
            if (!seen[ch]) {
                seen[ch] = true;
                result.push(ch);
            }
        }

        return result;
    }

    function mergeUniqueChars(charGroups) {
        var result = [];
        var seen = {};
        var i;
        var j;
        var chars;
        var ch;

        for (i = 0; i < charGroups.length; i += 1) {
            chars = charGroups[i].chars;
            for (j = 0; j < chars.length; j += 1) {
                ch = chars.charAt(j);
                if (!seen[ch]) {
                    seen[ch] = true;
                    result.push(ch);
                }
            }
        }

        return result;
    }

    function randomAllowedChar(chars, counts) {
        var candidates = [];
        var i;
        var ch;
        var index;

        for (i = 0; i < chars.length; i += 1) {
            ch = chars[i];
            if (!counts[ch] || counts[ch] < 2) {
                candidates.push(ch);
            }
        }

        if (!candidates.length) {
            return '';
        }

        index = secureRandomInt(candidates.length);
        if (index === null) {
            return null;
        }

        return candidates[index];
    }

    function addGeneratedChar(generated, counts, ch) {
        generated.push(ch);
        counts[ch] = (counts[ch] || 0) + 1;
    }

    function shuffleChars(chars) {
        var i;
        var j;
        var temp;

        for (i = chars.length - 1; i > 0; i -= 1) {
            j = secureRandomInt(i + 1);
            if (j === null) {
                return null;
            }
            temp = chars[i];
            chars[i] = chars[j];
            chars[j] = temp;
        }

        return chars;
    }

    function generatePassword() {
        var length = parseInt($('#passwordLength').val(), 10);
        var selected = selectedPasswordCharsets();
        var allChars;
        var generated = [];
        var counts = {};
        var maxLength;
        var i;
        var nextChar;
        var groupChars;

        if (!length || length < 1) {
            length = 30;
            $('#passwordLength').val(length);
        }

        if (!selected.length) {
            alert('Выберите хотя бы один набор символов.');
            return;
        }

        allChars = mergeUniqueChars(selected);
        maxLength = allChars.length * 2;

        if (length > maxLength) {
            alert('Для выбранных наборов максимум ' + maxLength + ' символов, если каждый символ повторяется не более 2 раз.');
            return;
        }

        for (i = 0; i < selected.length; i += 1) {
            if (length >= selected.length) {
                groupChars = uniqueCharsFromString(selected[i].chars);
                nextChar = randomAllowedChar(groupChars, counts);
                if (nextChar === null) {
                    alert('Генерация пароля недоступна: браузер не поддерживает crypto.getRandomValues.');
                    return;
                }
                if (nextChar) {
                    addGeneratedChar(generated, counts, nextChar);
                }
            }
        }

        while (generated.length < length) {
            nextChar = randomAllowedChar(allChars, counts);
            if (nextChar === null) {
                alert('Генерация пароля недоступна: браузер не поддерживает crypto.getRandomValues.');
                return;
            }
            if (!nextChar) {
                alert('Не удалось сгенерировать пароль без повторения символов более 2 раз.');
                return;
            }
            addGeneratedChar(generated, counts, nextChar);
        }

        generated = shuffleChars(generated);
        if (generated === null) {
            alert('Генерация пароля недоступна: браузер не поддерживает crypto.getRandomValues.');
            return;
        }

        $('#formPassword').val(generated.join(''));
    }

    function bindEvents() {
        $('.auth-tab').on('click', function () {
            setAuthMode($(this).attr('data-auth-mode'));
        });
        $('#authSubmitBtn').on('click', submitAuth);
        $('#authLogin, #authPassword, #authKey').on('keydown', function (event) {
            if (event.which === 13) {
                submitAuth();
            }
        });
        $('#currentUserBtn').on('click', logout);
        $('#mobileMenuToggle').on('click', toggleMobileMenu);
        $('#mobileSearchPinBtn').on('click', toggleMobileSearchPinned);
        $('#masterKey').on('input keyup change', onMasterKeyInput);
        $('#rememberKey').on('change', saveKeyToLocalStorage);
        $('#storeLocalData').on('change', onLocalDataSettingChange);
        $('#hidePasswords, #hideUsernames, #hideNotes, #hideOtp').on('change', onVisibilitySettingChange);
        $('#darkTheme').on('change', onDarkThemeChange);
        $('#settingsDropdownToggle').on('click', toggleSettingsDropdown);
        $('#settingsDropdownMenu').on('click', function (event) {
            event.stopPropagation();
        });
        $('.js-search-input').on('input keyup', onSearchInput);
        $('#saveBtn').on('click', savePassword);
        $('#cancelBtn').on('click', resetForm);
        $('#exportBtn').on('click', exportJSON);
        $('#importFile').on('change', onImportFileChange);
        $('#importBtn').on('click', importSelectedJSON);
        $('#formOtpCameraBtn').on('click', function () {
            startOtpCameraScan($('#formOtp'), $('#formOtpCameraMessage'));
        });
        $('#generatePasswordBtn').on('click', generatePassword);
        $('#passwordCharsetToggle').on('click', function (event) {
            event.stopPropagation();
            $('#passwordCharsetDropdown').toggleClass('open');
        });
        $('#passwordCharsetMenu').on('click', function (event) {
            event.stopPropagation();
        });
        $('.js-password-charset').on('change', updatePasswordCharsetLabel);
        $(document).on('click', function () {
            $('#passwordCharsetDropdown').removeClass('open');
            closeSettingsDropdown();
        });

        $('.tabs-container').on('click', '.js-group-tab', function () {
            var id = $(this).attr('data-group-id');
            selectGroup(id ? parseInt(id, 10) : null);
        });
        $('.tabs-container').on('click', '.js-create-group', createGroup);
        $('.tabs-container').on('click', '.js-edit-group', function (event) {
            editGroup(event, parseInt($(this).attr('data-id'), 10));
        });
        $('.tabs-container').on('click', '.js-delete-group', function (event) {
            deleteGroup(event, parseInt($(this).attr('data-id'), 10));
        });

        $('#passwordsList').on('click', '.js-copy', function () {
            copyText($(this));
        });
        $('#passwordsList').on('click', '.js-otp-qr', function () {
            showOtpQr($(this));
        });
        $('#passwordsList').on('click', '.js-edit-password', function () {
            editPassword(parseInt($(this).attr('data-id'), 10));
        });
        $('#passwordsList').on('click', '.js-save-inline-password', function () {
            saveInlinePassword(parseInt($(this).attr('data-id'), 10));
        });
        $('#passwordsList').on('click', '.js-card-otp-camera', function () {
            var $card = $(this).closest('.card');

            startOtpCameraScan(
                $card.find('.js-card-edit-field[data-field="otp"]'),
                $card.find('.js-card-otp-message')
            );
        });
        $('#passwordsList').on('click', '.js-cancel-inline-password', cancelInlineEdit);
        $('#passwordsList').on('click', '.js-delete-password', function () {
            deletePassword(parseInt($(this).attr('data-id'), 10));
        });
        $('#passwordsList').on('click', '.js-toggle-favorite', function () {
            toggleFavorite(parseInt($(this).attr('data-id'), 10));
        });
        $('#passwordsList').on('click', '.js-toggle-field-visibility', function () {
            var $btn = $(this);
            var $field = $btn.closest('.card-field');
            var isOpen = $btn.hasClass('eye-open');

            if (isOpen) {
                $field.find('.field-value-plain').addClass('field-hidden');
                $field.find('.field-value-mask').removeClass('field-hidden');
                $btn.removeClass('eye-open').text('⊘');
            } else {
                $field.find('.field-value-mask').addClass('field-hidden');
                $field.find('.field-value-plain').removeClass('field-hidden');
                $btn.addClass('eye-open').text('⊙');
            }
        });
        $(document).on('click', '.js-close-otp-qr', closeOtpQrModal);
        $(document).on('click', '#otpQrModal', function (event) {
            if (event.target === this) {
                closeOtpQrModal();
            }
        });
        $(document).on('click', '.js-close-otp-camera', function () {
            stopOtpCameraScan();
        });
        $(document).on('click', '#otpCameraModal', function (event) {
            if (event.target === this) {
                stopOtpCameraScan();
            }
        });

        $(window).on('resize orientationchange', syncResponsiveBlocks);
    }

    var apiStatusOnline = false;
    var apiStatusPolling = false;

    function setApiStatus(online) {
        var $status = $('#apiStatus');
        apiStatusOnline = !!online;

        if (online) {
            $status.removeClass('api-status-offline').addClass('api-status-online');
            $status.find('.api-status-text').text('online');
        } else {
            $status.removeClass('api-status-online').addClass('api-status-offline');
            $status.find('.api-status-text').text('offline');
        }
    }

    function pingApiStatus() {
        apiStatusPolling = true;
        $.ajax({
            url: 'api.php?action=session',
            type: 'GET',
            cache: false,
            timeout: 4000
        }).done(function (_data, _status, xhr) {
            if (xhr && xhr.status === 200) {
                apiStatusPolling = false;
                setApiStatus(true);
            } else {
                setApiStatus(false);
                window.setTimeout(pingApiStatus, 2000);
            }
        }).fail(function () {
            setApiStatus(false);
            window.setTimeout(pingApiStatus, 2000);
        });
    }

    function markApiOffline() {
        setApiStatus(false);
        if (!apiStatusPolling) {
            apiStatusPolling = true;
            window.setTimeout(pingApiStatus, 2000);
        }
    }

    $(function () {
        initDebugMode();
        registerServiceWorker();
        loadMobileSearchPinSetting();
        syncResponsiveBlocks();
        loadVisibilitySettings();
        loadLocalDataSettings();
        loadDarkThemeSetting();
        updatePasswordCharsetLabel();
        startOtpTimer();
        bindEvents();
        initTabsSortable();
        checkLocalAssetIntegrity();
        initImportDropzone();
        pingApiStatus();
        loadKeyFromLocalStorage().always(function () {
            checkSession();
        });
    });
}(jQuery));
}
