function handleAuthenticateResponse(loginResult) {
    if (loginResult.authenticated) {
        if (loginResult.twoStep) {
            window.sessionStorage.setItem("simple-id", {
                user: $("#inputUsername").val(),
                token: loginResult.userToken,
            });
        }
        handleRedirect();
    } else {
        $("#formMessage").removeClass("hidden form-message-info");
        $("#formMessage").addClass("form-message-error");
        $("#message").text("Login Failed!");
        $("#inputPassword").focus();
    }
}

function handleRedirect() {
    if (CONFIG.redirectUrl) {
        location.href = CONFIG.redirectUrl;
    } else {
        location.reload();
    }
}

function formSubmitted() {
    enableFormSubmit(false);
    var data = {
        action: "login",
        user: $("#inputUsername").val(),
        password: $("#inputPassword").val(),
    };
    $.ajax({
        url: CONFIG.loginServiceUrl,
        type: "post",
        dataType: "json",
        contentType: "application/json",
        success: handleAuthenticateResponse,
        data: JSON.stringify(data),
    }).always(function () {
        enableFormSubmit(true);
    });
}

$("#inputUsername, #inputPassword").keyup(function (event) {
    if (event.which !== 13) {
        $("#formMessage").removeClass("form-message-info form-message-error");
        $("#formMessage").addClass("hidden");
    }
});
