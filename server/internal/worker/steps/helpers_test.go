package steps

// errTest is a simple error type for use in tests.
type errTest string

func (e errTest) Error() string { return string(e) }
