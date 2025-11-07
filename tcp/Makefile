CC = gcc
CFLAGS = -std=c11 -Wall -Wextra -O2 -g \
         -I/home/malciller/dev/c_stuf/tcp/libwebsockets-install/include
LDFLAGS = -L/home/malciller/dev/c_stuf/tcp/libwebsockets-install/lib \
         -Wl,-rpath,/home/malciller/dev/c_stuf/tcp/libwebsockets-install/lib \
         -lwebsockets -lpthread
TARGET = stream_reader

all: $(TARGET)

$(TARGET): stream_reader.c
	$(CC) $(CFLAGS) stream_reader.c -o $(TARGET) $(LDFLAGS)

clean:
	rm -f $(TARGET)
