package engine

import "fmt"

type RouteRedirect struct {
	Status   int
	Location string
}

func (e *RouteRedirect) Error() string {
	return fmt.Sprintf("redirect(%d) to %s", e.Status, e.Location)
}

type RouteHTTPError struct {
	Status  int
	Message string
}

func (e *RouteHTTPError) Error() string {
	return e.Message
}

func Redirect(status int, location string) error {
	return &RouteRedirect{Status: status, Location: location}
}

func HTTPError(status int, message string) error {
	return &RouteHTTPError{Status: status, Message: message}
}
