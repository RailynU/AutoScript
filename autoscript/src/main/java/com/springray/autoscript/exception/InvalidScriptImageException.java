package com.springray.autoscript.exception;

public class InvalidScriptImageException extends RuntimeException {

    private final String errorCode;

    public InvalidScriptImageException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }
}
