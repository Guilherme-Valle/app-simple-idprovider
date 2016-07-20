function handleAuthenticateResponse(loginResult) {
    location.href = CONFIG.redirectUrl;
}

function formSubmitted() {
    var data = {
        email: $("#inputEmail").val()
    };
    $.ajax({
        url: CONFIG.sendTokenUrl,
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