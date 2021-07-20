const authLib = require('/lib/xp/auth');
const portalLib = require('/lib/xp/portal');
const httpClientLib = require('/lib/http-client');
const tokenLib = require('/lib/resetToken');
const twoStepLib = require('/lib/twoStepToken');
const renderLib = require('/lib/render/render');
const contextLib = require('/lib/context');
const mailLib = require('/lib/mail');
const userLib = require('/lib/user');
const configLib = require('/lib/config');

exports.handle401 = function (req) {
    const body = getLoginPage();

    return {
        status: 401,
        contentType: 'text/html',
        body: body
    };
};

exports.login = function (req) {
    const redirectUrl = req.validTicket ? req.params.redirect : generateRedirectUrl();
    const body = getLoginPage(redirectUrl);
    return {
        contentType: 'text/html',
        body: body
    };
};

exports.logout = function (req) {
    authLib.logout();

    if (req.validTicket && req.params.redirect) {
        return {
            redirect: req.params.redirect
        };
    }

    const body = getLoginPage(generateRedirectUrl(), "Successfully logged out");
    return {
        contentType: 'text/html',
        body: body
    };
};

exports.get = function (req) {
    let body;

    const action = req.params.action;
    const params = req.params;
    if (action == 'forgot') {
        body = renderLib.generateForgotPasswordPage();
    }
    else if (action == 'sent') {
        body =
            renderLib.generateLoginPage(generateRedirectUrl(), "We have sent an email with instructions on how to reset your password");
    } 
    else if (action == 'reset' && params.token) {
        if (tokenLib.isTokenValid(params.token)) {
            body = renderLib.generateUpdatePasswordPage(params.token);
        } else {
            body = renderLib.generateForgotPasswordPage(true);
        }
    }  
    else if (action == 'code') {
        body = renderLib.generateCodePage(generateRedirectUrl(), "Email code");
    }
    else {
        const user = authLib.getUser();
        if (user) {
            body = renderLib.generateLogoutPage(user);
        } else {
            body = getLoginPage(generateRedirectUrl());
        }
    }

    return {
        contentType: 'text/html',
        body: body
    };
};

exports.post = function (req) {
    const body = JSON.parse(req.body);

    const action = body.action;
    if (action == 'login' && body.user && body.password) {
        return handleLogin(req, body.user, body.password);
    } else if (action == 'send' && body.email) {
        return handleForgotPassword(req, body);
    } else if (action == 'update' && body.token && body.password) {
        return handleUpdatePwd(req, body.token, body.password);
    } else if (action == 'code') {
        return handleCodeLogin(req, body.user, body.userToken, body.code);
    }

    return {
        status: 400,
        contentType: 'application/json'
    };
};

function getLoginPage(redirectUrl, info) {
    let codeRedirect;
    if (isEmailCodeRequired()) {
        codeRedirect = generateCodeRedirectpage();
    } 
    else {
        codeRedirect = generateRedirectUrl();
    }
    return renderLib.generateLoginPage(redirectUrl, info, codeRedirect);
}

function generateRedirectUrl() {
    const site = contextLib.runAsAdmin(function () {
        return portalLib.getSite();
    }); 
    if (site) {
        return portalLib.pageUrl({id: site._id});
    }
    return '/';
}

function generateCodeRedirectpage() {
    return contextLib.runAsAdmin(function () {
        return portalLib.idProviderUrl({
            params: {
                action: "code",
            },
        });
    });
}


function isEmailCodeRequired() {
    const idProviderConfig = configLib.getConfig();

    return (
        idProviderConfig.emailCode != false ||
        idProviderConfig.emailCode == undefined
    );
}

function handleLogin(req, user, password) {
    const sessionTimeout = configLib.getSessionTimeout();
    let loginResult;

    if (isEmailCodeRequired()) { //default true
        loginResult = authLib.login({
            user: user,
            password: password,
            idProvider: portalLib.getIdProviderKey(),
            scope: "REQUEST",
        });
        // request persists? Need to logout straight after. 
        if (loginResult.authenticated) {
            const userNode = twoStepLib.getUser(user);
            loginResult.twoStep = true;
            authLib.logout(); // this is super hacky

            const tokens = twoStepLib.generateTokens(user);
            try {
                // mailLib.sendLoginCodeEmail(req, userNode.email, tokens.emailCode);
            } catch (e) {
                //Locally emails fail. Change configuration or setup an email server
                log.error(`Could not send email:`);
                log.error(JSON.stringify(e.message, null, 4));
                log.error(JSON.stringify(e.stacktrace, null, 4));
            }

            loginResult.userToken = tokens.userToken;
        }
    } else {
        loginResult = authLib.login({
            user: user,
            password: password,
            idProvider: portalLib.getIdProviderKey(),
            sessionTimeout: sessionTimeout == null ? null : sessionTimeout,
            scope: "SESSION",
        });
    }
    return {
        body: loginResult,
        contentType: 'application/json'
    };
}

function handleCodeLogin(req, user, userToken, code) {
    const valid = twoStepLib.isTokenValid(user, userToken, code);
    
    if (valid) {
        const sessionTimeout = configLib.getSessionTimeout();
        const loginResult = authLib.login({
            user: user,
            idProvider: portalLib.getIdProviderKey(),
            sessionTimeout: sessionTimeout == null ? null : sessionTimeout,
            skipAuth: true,
            scope: "SESSION",
        });
        return {
            body: loginResult,
            contentType: 'application/json'
        };
    } 
    else {
        return {
            status: 403,
            body: {
                authenticated: false,
            },
            contentType: 'application/json'
        }
    }
}

function handleForgotPassword(req, params) {

    const reCaptcha = configLib.getRecaptcha();
    if (reCaptcha) {
        const reCaptchaVerificationResponse = httpClientLib.request({
            url: 'https://www.google.com/recaptcha/api/siteverify',
            method: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            multipart: [
                {
                    name: 'secret',
                    value: reCaptcha.secretKey
                },
                {
                    name: 'response',
                    value: params.reCaptcha
                }
            ]
        });

        const reCaptchaVerification = JSON.parse(reCaptchaVerificationResponse.body);
        if (!reCaptchaVerification || !reCaptchaVerification.success) {
            return {
                status: 400,
                contentType: 'application/json'
            }
        }
    }

    const user = userLib.findUserByEmail(params.email);

    //If a user has the email provided
    if (user) {
        //Generates a token
        const token = tokenLib.generateToken(user.key);

        mailLib.sendResetMail(req, params.email, token)

    } else {
        mailLib.sendIncorrectResetMail(req, params.email)
    }


    return {
        body: {},
        contentType: 'application/json'
    };
}

function handleUpdatePwd(req, token, password) {
    if (tokenLib.isTokenValid(token)) {
        contextLib.runAsAdmin(function () {
            const user = tokenLib.findUserByToken(token);

            authLib.changePassword({
                userKey: user.key,
                password: password
            });

            authLib.login({
                user: user.login,
                password: password,
                idProvider: portalLib.getIdProviderKey()
            });

            mailLib.sendUpdatedPasswordMail(req, user.email);

            tokenLib.removeToken(user.key);
        });

        return {
            body: {updated: true},
            contentType: 'application/json'
        };
    }

    return {
        body: {updated: false},
        contentType: 'application/json'
    };
}

