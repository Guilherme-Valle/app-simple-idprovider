function handleAuthenticateResponse(loginResult) {
    if (loginResult.authenticated) {
        location.href = CONFIG.redirectUrl;
    } else {
        $("#message").html("Login failed!").
            addClass("form-error-message").
            removeClass("form-success-message hidden");
        $("#inputPassword").focus();
    }
}

function formSubmitted() {
    var data = {
        user: $("#inputUsername").val(),
        password: $("#inputPassword").val(),
        userStore: CONFIG.userStoreKey
    };
    $.ajax({
        url: CONFIG.loginServiceUrl,
        type: 'post',
        dataType: 'json',
        contentType: 'application/json',
        success: handleAuthenticateResponse,
        data: JSON.stringify(data)
    });
}

$(".form-login").submit(function (event) {
    formSubmitted();
    event.preventDefault();
});

$("#inputUsername, #inputPassword").keyup(function (event) {
    if (event.which !== 13) {
        $("#message").addClass("hidden");
    }
});