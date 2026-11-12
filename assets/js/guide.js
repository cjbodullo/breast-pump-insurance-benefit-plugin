(function () {
    'use strict';

    var cfg = window.BBIB_GUIDE || {};
    var root = document.getElementById('bbib-view');
    if (!root) {
        return;
    }
    if (!cfg.insurers || !Object.keys(cfg.insurers).length) {
        root.innerHTML = '<div class="bbib-loading"><p class="bbib-intro" style="padding:0;text-align:center">Please refresh the page and try again.</p></div>';
        return;
    }

    var INSURERS = cfg.insurers;
    var KEY = 'bbib_guide_v1';
    var VIEWS = ['page1', 'page2', 'amount', 'thanks'];
    var RETAILERS = ['Amazon.ca', 'Walmart', 'Shoppers Drug Mart', 'Babies R Us', 'Brand website', 'Other'];
    var TIMINGS = ['Within 30 days', 'In 1–3 months', 'In 3+ months', 'Already bought'];
    var BRANDS = ['Medela', 'Momcozy', 'Spectra', 'Philips Avent', 'Lansinoh', 'Elvie', 'Willow', 'Other', "I haven't decided yet"];
    var DEFAULT = {
        view: 'page1',
        insurer: '',
        otherInsurer: '',
        email: '',
        amount: '',
        noAmount: false,
        brands: [],
        retailer: '',
        timing: '',
        shopOpen: true,
        source: cfg.source || 'direct',
        campaign: cfg.campaign || '',
        publicId: '',
        journeyVersion: 0,
        responseId: 0,
        responseVersion: 0,
        submitted: false,
        error: ''
    };

    var state = clone(DEFAULT);
    try {
        var stored = JSON.parse(sessionStorage.getItem(KEY));
        if (stored && typeof stored === 'object') {
            state = Object.assign({}, state, stored);
            if (!Array.isArray(state.brands)) {
                state.brands = [];
            }
            if (state.timing) {
                state.timing = normalizeTiming(state.timing);
            }
        }
    } catch (err) {
        state = clone(DEFAULT);
    }

    if (VIEWS.indexOf(state.view) === -1) {
        state.view = 'page1';
    }
    if (!state.insurer && state.view !== 'page1') {
        state.view = 'page1';
    }

    var csrf = '';
    var syncQueue = Promise.resolve();
    var opening = null;
    var saveRetryUsed = false;

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function save() {
        try {
            sessionStorage.setItem(KEY, JSON.stringify(state));
        } catch (err) {
            /* Private mode can block storage. */
        }
    }

    function uuid() {
        if (window.crypto && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
            var rand = Math.random() * 16 | 0;
            return (char === 'x' ? rand : (rand & 0x3 | 0x8)).toString(16);
        });
    }

    function normalizeTiming(label) {
        var map = {
            'Within 1-3 months': 'In 1–3 months',
            'More than 3 months from now': 'In 3+ months',
            'I already purchased one': 'Already bought'
        };
        return map[label] || label;
    }

    function isValidEmail(value) {
        var email = String(value || '').trim();
        return email !== '' && email.length <= 190 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function canAdvanceStep1() {
        if (!state.insurer || !isValidEmail(state.email)) {
            return false;
        }
        if (state.insurer === 'other' && !String(state.otherInsurer || '').trim()) {
            return false;
        }
        return true;
    }

    function syncStep1FromDom() {
        var insurerEl = root.querySelector('#insurer');
        var emailEl = root.querySelector('#email');
        var otherEl = root.querySelector('#otherInsurer');
        if (insurerEl) {
            state.insurer = insurerEl.value || '';
        }
        if (emailEl) {
            state.email = emailEl.value || '';
        }
        if (otherEl) {
            state.otherInsurer = otherEl.value || '';
        } else if (state.insurer !== 'other') {
            state.otherInsurer = '';
        }
    }

    function refreshNextButton() {
        if (state.view !== 'page1') {
            return;
        }
        syncStep1FromDom();
        var guide = document.getElementById('bbib-guide');
        var next = guide ? guide.querySelector('[data-action="next-page1"]') : null;
        if (!next) {
            return;
        }
        if (canAdvanceStep1()) {
            next.disabled = false;
            next.removeAttribute('disabled');
        } else {
            next.disabled = true;
            next.setAttribute('disabled', 'disabled');
        }
        save();
    }

    function syncStep2FromDom() {
        var retailerEl = root.querySelector('#retailer');
        var timingEl = root.querySelector('#timing');
        var amountEl = root.querySelector('#amount');
        var noAmountEl = root.querySelector('input[name="noAmount"]');
        if (retailerEl) {
            state.retailer = retailerEl.value || '';
        }
        if (timingEl) {
            state.timing = timingEl.value || '';
        }
        if (noAmountEl) {
            state.noAmount = !!noAmountEl.checked;
        }
        if (amountEl && !state.noAmount) {
            var rawAmount = String(amountEl.value || '').trim();
            if (rawAmount === '' || rawAmount === '000.00') {
                state.amount = '';
            } else {
                var digits = normalizeAmount(rawAmount);
                state.amount = digits === '' ? '' : String(Number(digits));
            }
        }
    }

    function setButtonEnabled(btn, enabled) {
        if (!btn) {
            return;
        }
        if (enabled) {
            btn.disabled = false;
            btn.removeAttribute('disabled');
        } else {
            btn.disabled = true;
            btn.setAttribute('disabled', 'disabled');
        }
    }

    function refreshInsurerButton() {
        var guide = document.getElementById('bbib-guide');
        if (!guide) {
            return;
        }
        syncStep2FromDom();
        if (state.view === 'page2') {
            setButtonEnabled(
                guide.querySelector('[data-action="open-insurer"], [data-action="enter-amount"]'),
                canGoToInsurer()
            );
        }
        if (state.view === 'amount') {
            setButtonEnabled(
                guide.querySelector('[data-action="close-amount"]'),
                isValidAmount()
            );
        }
        save();
    }

    function isValidAmount() {
        if (state.noAmount) {
            return true;
        }
        return /^\d{1,3}$/.test(String(state.amount || '')) && Number(state.amount) <= 999;
    }

    function normalizeAmount(value) {
        // Only the whole-dollar part — ignore ".00" so "30.00" stays "30", not "300".
        var whole = String(value || '').split('.')[0];
        return whole.replace(/[^\d]/g, '').slice(0, 3);
    }

    function formatAmountDisplay(amount) {
        var digits = normalizeAmount(amount);
        if (digits === '') {
            return '000.00';
        }
        return String(Number(digits)) + '.00';
    }

    function finishAmount(actionEl) {
        syncStep2FromDom();
        state.error = '';
        if (!isValidAmount()) {
            state.error = 'Enter a valid dollar amount, or select "I couldn\'t find a dollar amount".';
            refreshInsurerButton();
            render();
            return;
        }
        if (actionEl) {
            actionEl.disabled = true;
        }
        submitResponse().then(function () {
            go('thanks');
        }).catch(function (err) {
            if (err && err.status === 409) {
                state.error = 'These answers changed. Refresh the page and try again.';
            } else {
                state.error = (err && err.message) || 'We could not save your answers. Please try again.';
            }
            render();
        });
    }

    function currentInsurer() {
        return INSURERS[state.insurer] || null;
    }

    function insurerName() {
        var entry = currentInsurer();
        if (state.insurer === 'other' && state.otherInsurer) {
            return state.otherInsurer;
        }
        return entry ? entry.name : '';
    }

    function header() {
        return '<header class="bbib-header"><img class="bbib-logo" src="' + esc(cfg.logoUrl) + '" alt="BenefitChecker by BabyBrands Gift Club"><div class="bbib-caption">Breast Pump Insurance Guide</div><span class="bbib-accent"></span></header>';
    }

    function progress(label, filled) {
        var bars = '';
        for (var i = 1; i <= 3; i++) {
            bars += '<div class="bbib-progress-bar' + (i <= filled ? ' is-on' : '') + '"></div>';
        }
        return '<div class="bbib-progress"><span class="bbib-progress-label">' + esc(label) + '</span><div class="bbib-progress-bars">' + bars + '</div></div>';
    }

    function footer() {
        return '<div class="bbib-footer"><button type="button" data-action="privacy">Privacy</button><button type="button" data-action="about">About this guide</button></div>';
    }

    function errorBox() {
        if (!state.error) {
            return '';
        }
        return '<div class="bbib-error" role="alert">' + esc(state.error) + '</div>';
    }

    function selectHtml(name, options, placeholder, selected) {
        var html = '<select class="bbib-select" name="' + esc(name) + '" id="' + esc(name) + '">';
        html += '<option value="">' + esc(placeholder) + '</option>';
        options.forEach(function (option) {
            var value = typeof option === 'string' ? option : option.value;
            var label = typeof option === 'string' ? option : option.label;
            html += '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(label) + '</option>';
        });
        html += '</select>';
        return html;
    }

    function insurerOptions() {
        return Object.keys(INSURERS).map(function (code) {
            return { value: code, label: INSURERS[code].name };
        });
    }

    function page1() {
        var other = state.insurer === 'other'
            ? '<div class="bbib-field"><label class="bbib-label" for="otherInsurer">Insurance company name</label><input class="bbib-input" type="text" name="otherInsurer" id="otherInsurer" maxlength="100" value="' + esc(state.otherInsurer) + '"></div>'
            : '';
        return '<main class="bbib-page">' +
            progress('STEP 1 OF 3 / YOUR INSURER', 1) +
            errorBox() +
            '<section class="bbib-hero"><h1>Your Insurance Could Help Pay for Your Breast Pump!</h1><p>Find out if your plan covers a breast pump and how much you may be eligible to receive.</p><div class="bbib-hero-rule"></div></section>' +
            '<div class="bbib-field"><label class="bbib-label" for="insurer">Which insurance company do you have?</label>' +
            selectHtml('insurer', insurerOptions(), 'Select an insurance company', state.insurer) + '</div>' +
            other +
            '<div class="bbib-field"><label class="bbib-label" for="email">Email</label><input class="bbib-input" type="email" name="email" id="email" maxlength="190" autocomplete="email" value="' + esc(state.email) + '"><span class="bbib-help">Use the email from your BabyBrands registration.</span></div>' +
            '<button type="button" class="bbib-btn bbib-btn-primary" data-action="next-page1"' + (canAdvanceStep1() ? '' : ' disabled') + '>Next</button>' +
            '</main>' + footer();
    }

    function shopping() {
        var brandHtml = BRANDS.map(function (brand) {
            var checked = state.brands.indexOf(brand) !== -1 ? ' checked' : '';
            return '<label class="bbib-check"><input type="checkbox" name="brands" value="' + esc(brand) + '"' + checked + '>' + esc(brand) + '</label>';
        }).join('');
        var body = state.shopOpen
            ? '<div class="bbib-shop-body"><fieldset><legend class="bbib-label">Which breast pump brands are you considering?</legend><span class="bbib-help" style="display:block;margin:6px 0">Select all that apply. No model selection needed.</span><div class="bbib-rows">' + brandHtml + '</div></fieldset>' +
              '<div class="bbib-field"><label class="bbib-label" for="retailer">Where are you planning to purchase?</label>' + selectHtml('retailer', RETAILERS, 'Select a retailer', state.retailer) + '</div>' +
              '<div class="bbib-field"><label class="bbib-label" for="timing">When are you planning to buy?</label>' + selectHtml('timing', TIMINGS, 'Select a time frame', state.timing) + '</div></div>'
            : '';
        return '<section class="bbib-shop"><button type="button" class="bbib-shop-toggle" data-action="toggle-shop" aria-expanded="' + (state.shopOpen ? 'true' : 'false') + '">Your breast pump shopping plans<span aria-hidden="true">' + (state.shopOpen ? '−' : '+') + '</span></button>' + body + '</section>';
    }

    function canGoToInsurer() {
        return state.brands.length > 0 && !!String(state.retailer || '').trim() && !!String(state.timing || '').trim();
    }

    function areas() {
        var entry = currentInsurer();
        if (!entry || !entry.areas || !entry.areas.length) {
            return '';
        }
        // Match the reference: one box titled "Places to check in your plan" with two headings.
        var places = entry.areas.slice(0, 2);
        var rows = places.map(function (area, i) {
            var title = Array.isArray(area) ? area[0] : (area.title || '');
            var body = Array.isArray(area) ? area[1] : (area.instructions || '');
            return '<div class="bbib-area-row"><span class="bbib-area-num" aria-hidden="true">' + (i + 1) + '</span><div class="bbib-area-copy"><strong>' + esc(title) + '</strong><span>' + esc(body) + '</span></div></div>';
        }).join('');
        return '<section class="bbib-areas"><h2>Places to check in your plan</h2><div class="bbib-area-box">' + rows + '</div></section>';
    }

    function amountCard() {
        var display = state.noAmount ? '' : formatAmountDisplay(state.amount);
        return '<section class="bbib-money"><h1>How much is available toward your breast pump?</h1><p>Enter the dollar amount your insurer showed specifically for a breast pump.</p>' +
            '<div class="bbib-money-input"><span class="bbib-currency">$</span><input type="text" inputmode="decimal" name="amount" id="amount" value="' + esc(display) + '" placeholder="000.00" aria-label="Dollar amount"' + (state.noAmount ? ' disabled' : '') + '><span class="bbib-cad">CAD</span></div>' +
            '<label class="bbib-check"><input type="checkbox" name="noAmount"' + (state.noAmount ? ' checked' : '') + '>I couldn\'t find a dollar amount</label></section>' +
            '<p class="bbib-notice">' + esc(cfg.notice || '') + '</p>';
    }

    function page2() {
        var entry = currentInsurer();
        var name = entry ? entry.name : '';
        var login = entry ? (entry.login || entry.existing_help || entry.existingHelp || '') : '';
        var url = entry && entry.url ? entry.url : '';
        var ready = canGoToInsurer();
        var disabledAttr = ready ? '' : ' disabled';
        var action = url
            ? '<button type="button" class="bbib-btn bbib-btn-dark" data-action="open-insurer"' + disabledAttr + '>Go to ' + esc(name) + ' Website<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path></svg></button><p class="bbib-micro">Opens in a new tab and continues to your results here<br>so you can report what you find.</p>'
            : '<button type="button" class="bbib-btn bbib-btn-dark" data-action="enter-amount"' + disabledAttr + '>Enter the amount you found</button>';
        return '<main class="bbib-page">' +
            progress('STEP 2 OF 3 / FIND YOUR COVERAGE', 2) +
            errorBox() +
            shopping() +
            areas() +
            '<section class="bbib-cover"><h1>Let\'s find your ' + esc(name) + ' coverage.</h1><p>Sign in on your insurer\'s website, then come back here to share what you find.<br><span class="bbib-help">' + esc(login) + '</span></p>' + action + '</section>' +
            '<p class="bbib-micro">Free to use · No obligation to purchase</p>' +
            '<button type="button" class="bbib-btn-link" data-action="back-page1">Back</button>' +
            '</main>' + footer();
    }

    function amountView() {
        return '<main class="bbib-page">' +
            progress('STEP 2 OF 3 / FIND YOUR COVERAGE', 2) +
            errorBox() +
            amountCard() +
            '<button type="button" class="bbib-btn bbib-btn-primary" data-action="close-amount"' + (isValidAmount() ? '' : ' disabled') + '>Close</button>' +
            '<button type="button" class="bbib-btn-link" data-action="back-page2">Back</button>' +
            '</main>' + footer();
    }

    function thanks() {
        var money = state.noAmount
            ? 'I couldn\'t find a dollar amount'
            : ('$' + formatAmountDisplay(state.amount));
        return '<main class="bbib-page bbib-thanks">' +
            progress('STEP 3 OF 3 / THANK YOU', 3) +
            errorBox() +
            '<div class="bbib-thanks-hero">' +
            '<div class="bbib-thanks-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4 10-10"/></svg></div>' +
            '<p class="bbib-thanks-kicker">GUIDE COMPLETE</p>' +
            '<h1>Thank you</h1>' +
            '<p class="bbib-thanks-copy">Your answers were saved. Here is what you reported.</p>' +
            '</div>' +
            '<section class="bbib-summary">' +
            '<div class="bbib-summary-title">Your reported results</div>' +
            '<div class="bbib-summary-row"><small>Insurance company</small><strong>' + esc(insurerName()) + '</strong></div>' +
            '<div class="bbib-summary-row"><small>Email</small><strong>' + esc(state.email) + '</strong></div>' +
            '<div class="bbib-summary-row is-amount"><small>Dollar amount you reported</small><strong>' + esc(money) + '</strong><small>CAD · Self-reported · Not a payment guarantee</small></div>' +
            '</section>' +
            '<p class="bbib-thanks-note">Your insurer decides eligibility and reimbursement. A dollar limit may be subject to a percentage, remaining benefits and other conditions.</p>' +
            '<div class="bbib-actions">' +
            '<button type="button" class="bbib-btn bbib-btn-dark" data-action="return">Return to BabyBrands</button>' +
            '<button type="button" class="bbib-btn-link" data-action="edit">Edit my answers</button>' +
            '</div>' +
            '</main>' + footer();
    }

    function removeThemeSelect() {
        var shell = document.getElementById('bbib-guide');
        if (!shell) {
            return;
        }
        shell.querySelectorAll('.nice-select, .select2, .chosen-container').forEach(function (node) {
            node.remove();
        });
        shell.querySelectorAll('select').forEach(function (select) {
            select.style.display = 'block';
        });
    }

    function render() {
        var views = { page1: page1, page2: page2, amount: amountView, thanks: thanks };
        var draw = views[state.view] || page1;
        root.innerHTML = header() + draw();
        save();
        removeThemeSelect();
        refreshNextButton();
        refreshInsurerButton();
    }

    function go(view) {
        state.view = view;
        state.error = '';
        var step = view === 'page1' ? 1 : (view === 'thanks' ? 3 : 2);
        track('step_viewed', step);
        syncJourney();
        render();
        window.scrollTo(0, 0);
        var shell = document.getElementById('bbib-guide');
        if (shell && shell.scrollIntoView) {
            shell.scrollIntoView({ block: 'start' });
        }
    }

    function tell(title, body) {
        var dialog = document.getElementById('bbib-notice');
        var titleEl = document.getElementById('bbib-notice-title');
        var bodyEl = document.getElementById('bbib-notice-body');
        if (titleEl) {
            titleEl.textContent = title;
        }
        if (bodyEl) {
            bodyEl.textContent = body;
        }
        if (dialog && dialog.showModal) {
            dialog.showModal();
        }
    }

    function api(method, path, body, keepalive) {
        return fetch(cfg.restUrl + path, {
            method: method,
            credentials: 'same-origin',
            keepalive: !!keepalive,
            headers: {
                'Content-Type': 'application/json',
                'X-BBGC-CSRF': csrf || ''
            },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (response) {
            return response.json().catch(function () {
                return {};
            }).then(function (data) {
                if (!response.ok) {
                    var error = new Error((data && data.message) || 'We could not save your answers. Please try again.');
                    error.status = response.status;
                    error.code = data && data.code ? data.code : '';
                    throw error;
                }
                return data;
            });
        });
    }

    function rememberJourney(data) {
        if (!data) {
            return;
        }
        if (data.csrf) {
            csrf = data.csrf;
        }
        if (data.publicId && state.publicId && data.publicId !== state.publicId) {
            state.responseId = 0;
            state.responseVersion = 0;
            state.submitted = false;
            try {
                sessionStorage.removeItem('bbib_idem');
            } catch (err) {
                /* ignore */
            }
        }
        if (data.publicId) {
            state.publicId = data.publicId;
        }
        if (data.rowVersion) {
            state.journeyVersion = data.rowVersion;
        }
        save();
    }

    function applyServer(data) {
        rememberJourney(data);
        if (!data) {
            return;
        }
        if (data.response) {
            var response = data.response;
            state.submitted = true;
            state.responseId = response.id;
            state.responseVersion = response.rowVersion;
            state.email = response.email || state.email;
            state.amount = response.amount || '';
            state.noAmount = !!response.noAmount;
            state.brands = response.brands || [];
            state.retailer = response.retailer || '';
            state.timing = normalizeTiming(response.timing || '');
            if (data.insurer) {
                state.insurer = data.insurer;
            }
            state.otherInsurer = data.insurerOther || state.otherInsurer;
            if (state.view !== 'amount') {
                state.view = 'thanks';
            }
        } else if (data.insurer && !state.insurer) {
            state.insurer = data.insurer;
            state.otherInsurer = data.insurerOther || '';
        }
        save();
    }

    function ensureSession() {
        if (csrf) {
            return Promise.resolve();
        }
        if (opening) {
            return opening;
        }
        opening = api('POST', '/journeys', {
            source: state.source || cfg.source || 'direct',
            campaign: state.campaign || cfg.campaign || ''
        }).then(function (data) {
            applyServer(data);
        }).finally(function () {
            opening = null;
        });
        return opening;
    }

    function syncJourney() {
        syncQueue = syncQueue.then(function () {
            if (!csrf || !cfg.restUrl) {
                return;
            }
            var step = state.view === 'page1' ? 1 : (state.view === 'thanks' ? 3 : 2);
            return api('PATCH', '/journey', {
                insurer: state.insurer || '',
                insurerOther: state.otherInsurer || '',
                step: step,
                rowVersion: state.journeyVersion || 0
            }).then(function (data) {
                rememberJourney(data);
            });
        }).catch(function (err) {
            if (err && err.status === 409) {
                state.error = 'This guide was updated somewhere else. Refresh and try again.';
                render();
            }
        });
        return syncQueue;
    }

    function track(type, step) {
        var event = { type: type, step: step, uuid: uuid() };
        ensureSession().then(function () {
            if (!csrf) {
                return;
            }
            api('POST', '/events', { events: [event] }, true).catch(function () {});
        }).catch(function () {});
    }

    function idempotencyKey() {
        var key = sessionStorage.getItem('bbib_idem');
        if (!key) {
            key = uuid();
            sessionStorage.setItem('bbib_idem', key);
        }
        return key;
    }

    function responseBody() {
        var noAmount = !!state.noAmount;
        return {
            coverage: noAmount ? 'unclear' : 'yes',
            email: String(state.email || '').trim(),
            amount: noAmount ? '' : String(state.amount || ''),
            noAmount: noAmount,
            brands: state.brands,
            retailer: state.retailer,
            timing: state.timing,
            noticeVersion: cfg.noticeVersion || ''
        };
    }

    function submitResponse(isRetry) {
        return ensureSession().then(function () {
            return syncJourney();
        }).then(function () {
            var body = responseBody();
            if (state.responseId) {
                body.responseVersion = state.responseVersion;
                return api('PUT', '/response', body);
            }
            body.idempotencyKey = idempotencyKey();
            return api('POST', '/response', body).catch(function (err) {
                if (err && err.code === 'exists' && state.responseVersion) {
                    body.responseVersion = state.responseVersion;
                    delete body.idempotencyKey;
                    return api('PUT', '/response', body);
                }
                throw err;
            });
        }).then(function (data) {
            if (data && data.response) {
                state.responseId = data.response.id;
                state.responseVersion = data.response.rowVersion;
                state.submitted = true;
                state.amount = data.response.amount || state.amount;
                state.noAmount = !!data.response.noAmount;
                if (data.response.timing) {
                    state.timing = normalizeTiming(data.response.timing);
                }
            }
            if (data && data.rowVersion) {
                state.journeyVersion = data.rowVersion;
            }
            saveRetryUsed = false;
            save();
        }).catch(function (err) {
            if (err && err.status === 401 && !isRetry && !saveRetryUsed) {
                saveRetryUsed = true;
                csrf = '';
                return ensureSession().then(function () {
                    return submitResponse(true);
                });
            }
            throw err;
        });
    }

    var shell = document.getElementById('bbib-guide');
    if (shell) {
        shell.addEventListener('click', function (event) {
            var actionEl = event.target.closest('[data-action]');
            if (!actionEl || !shell.contains(actionEl)) {
                return;
            }
            var action = actionEl.getAttribute('data-action');
            if (action === 'privacy') {
                tell('Privacy', cfg.privacy || '');
                return;
            }
            if (action === 'about') {
                tell('About this guide', cfg.about || '');
                return;
            }
            if (action === 'next-page1') {
                syncStep1FromDom();
                if (!canAdvanceStep1()) {
                    refreshNextButton();
                    return;
                }
                state.error = '';
                actionEl.disabled = true;
                ensureSession().then(function () {
                    return syncJourney();
                }).then(function () {
                    go('page2');
                }).catch(function () {
                    state.error = 'Please refresh the page and try again.';
                    actionEl.disabled = false;
                    render();
                });
                return;
            }
            if (action === 'back-page1') {
                go('page1');
                return;
            }
            if (action === 'toggle-shop') {
                state.shopOpen = !state.shopOpen;
                render();
                return;
            }
            if (action === 'back-page2') {
                go('page2');
                return;
            }
            if (action === 'open-insurer') {
                syncStep2FromDom();
                if (!canGoToInsurer()) {
                    refreshInsurerButton();
                    return;
                }
                var entry = currentInsurer();
                if (entry && entry.url) {
                    window.open(entry.url, '_blank', 'noopener,noreferrer');
                    track('insurer_website_clicked', 2);
                }
                go('amount');
                return;
            }
            if (action === 'enter-amount') {
                syncStep2FromDom();
                if (!canGoToInsurer()) {
                    refreshInsurerButton();
                    return;
                }
                go('amount');
                return;
            }
            if (action === 'close-amount') {
                finishAmount(actionEl);
                return;
            }
            if (action === 'edit') {
                go('amount');
                return;
            }
            if (action === 'return') {
                track('return_to_babybrands_clicked', 3);
                if (cfg.returnUrl) {
                    window.location.href = cfg.returnUrl;
                }
            }
        });

        shell.addEventListener('change', function (event) {
            if (!root.contains(event.target)) {
                return;
            }
            var name = event.target.name;
            if (name === 'insurer') {
                if (state.insurer && state.insurer !== event.target.value) {
                    state.amount = '';
                    state.noAmount = false;
                }
                state.insurer = event.target.value;
                if (state.insurer !== 'other') {
                    state.otherInsurer = '';
                }
                render();
                refreshNextButton();
                return;
            }
            if (name === 'email' || name === 'otherInsurer') {
                refreshNextButton();
                return;
            }
            if (name === 'retailer') {
                state.retailer = event.target.value;
                refreshInsurerButton();
                return;
            }
            if (name === 'timing') {
                state.timing = event.target.value;
                refreshInsurerButton();
                return;
            }
            if (name === 'noAmount') {
                state.noAmount = !!event.target.checked;
                if (state.noAmount) {
                    state.amount = '';
                }
                render();
                refreshInsurerButton();
                return;
            }
            if (name === 'brands') {
                var value = event.target.value;
                if (value === "I haven't decided yet" && event.target.checked) {
                    state.brands = ["I haven't decided yet"];
                } else {
                    state.brands = state.brands.filter(function (brand) {
                        return brand !== "I haven't decided yet";
                    });
                    if (event.target.checked) {
                        if (state.brands.indexOf(value) === -1) {
                            state.brands.push(value);
                        }
                    } else {
                        state.brands = state.brands.filter(function (brand) {
                            return brand !== value;
                        });
                    }
                }
                render();
            }
        });

        shell.addEventListener('input', function (event) {
            if (!root.contains(event.target)) {
                return;
            }
            var name = event.target.name;
            if (name === 'email' || name === 'otherInsurer') {
                refreshNextButton();
                return;
            }
            if (name === 'amount') {
                var cleaned = normalizeAmount(event.target.value);
                state.amount = cleaned === '' ? '' : String(Number(cleaned));
                event.target.value = cleaned;
                refreshInsurerButton();
                return;
            }
        });

        shell.addEventListener('focusin', function (event) {
            if (!root.contains(event.target) || event.target.name !== 'amount' || state.noAmount) {
                return;
            }
            event.target.value = state.amount ? String(state.amount) : '';
        });

        shell.addEventListener('focusout', function (event) {
            if (!root.contains(event.target)) {
                return;
            }
            if (event.target.name === 'email' || event.target.name === 'otherInsurer' || event.target.name === 'insurer') {
                refreshNextButton();
            }
            if (event.target.name === 'amount' && !state.noAmount) {
                syncStep2FromDom();
                event.target.value = formatAmountDisplay(state.amount);
                refreshInsurerButton();
            }
        });
    }

    var closeNotice = document.getElementById('bbib-close-notice');
    if (closeNotice) {
        closeNotice.addEventListener('click', function () {
            var dialog = document.getElementById('bbib-notice');
            if (dialog && dialog.close) {
                dialog.close();
            }
        });
    }

    ensureSession().then(function () {
        render();
    }).catch(function () {
        state.error = 'Please refresh the page and try again.';
        render();
    });
})();
