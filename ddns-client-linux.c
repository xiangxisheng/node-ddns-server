#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <ifaddrs.h>
#include <netdb.h>
#include <sys/ioctl.h>
#include <net/if.h>
#include <fcntl.h>
#include <libgen.h>

#define SERVER_ADDR "v6.fm20.cn"
#define SERVER_PORT 1
#define BUFFER_SIZE 1024

const char *extract_filename(const char *path)
{
	const char *filename = strrchr(path, '/');
	if (filename != NULL)
	{
		filename++; // 跳过斜杠字符
		return filename;
	}
	return path;
}

int lock_pid_file(const char *program_name)
{
	char pid_file[256];
	struct flock lock;

	sprintf(pid_file, "/var/run/%s.pid", program_name);

	// 尝试打开 PID 文件
	int pid_fd = open(pid_file, O_CREAT | O_RDWR, 0666);
	if (pid_fd == -1)
	{
		perror("open");
		return -1;
	}

	// 尝试获取文件锁
	lock.l_type = F_WRLCK; // 写锁
	lock.l_whence = SEEK_SET;
	lock.l_start = 0;
	lock.l_len = 0;

	int ret = fcntl(pid_fd, F_SETLK, &lock);
	if (ret == -1)
	{
		// 如果无法获得锁，则说明已有相同的进程在运行
		printf("Another instance is already running.\n");
		return -1;
	}

	FILE *f = fdopen(pid_fd, "w");
	if (f == NULL)
	{
		perror("fdopen");
		return -1;
	}

	// 将当前进程的进程 ID 写入到 PID 文件中
	if (fprintf(f, "%d", getpid()) < 0)
	{
		perror("fprintf");
		return -1;
	}

	// 关闭文件描述符并刷新文件流
	if (fflush(f) != 0)
	{
		perror("fflush");
		return -1;
	}
	return 0;
}

int is_ipv6_2000_prefix(const struct in6_addr *addr)
{
	// 将IPv6地址的第一个字节与0b11100000进行与运算，
	// 如果结果等于0b00100000(即32)，则地址属于2000::/3网段
	return (addr->s6_addr[0] & 0xE0) == 0x20;
}

char *getPublicIpv6InterfaceName()
{
	char *interfaceName = NULL;
	struct ifaddrs *ifaddr;
	char sIpv6[INET6_ADDRSTRLEN];
	getifaddrs(&ifaddr);
	while (ifaddr != NULL)
	{
		// 跳过空指针
		if (ifaddr->ifa_addr == NULL)
		{
			continue;
		}
		if (ifaddr->ifa_addr->sa_family == AF_INET6)
		{
			void *nIpv6 = &((struct sockaddr_in6 *)ifaddr->ifa_addr)->sin6_addr;
			if (is_ipv6_2000_prefix(nIpv6))
			{
				inet_ntop(AF_INET6, nIpv6, sIpv6, INET6_ADDRSTRLEN);
				// printf("IPv6 Address   : %s\n", sIpv6);
				// printf("Interface Name : %s\n", ifaddr->ifa_name);
				interfaceName = ifaddr->ifa_name;
			}
		}
		ifaddr = ifaddr->ifa_next;
	}
	freeifaddrs(ifaddr);
	return interfaceName;
}

int getMACAddress(const char *ifa_name, unsigned char *mac_addr)
{
	struct ifreq ifr;
	int sockfd, ret;
	// 创建套接字
	sockfd = socket(AF_INET, SOCK_DGRAM, 0);
	if (sockfd < 0)
	{
		perror("socket");
		return -1;
	}
	// 设置接口名
	strncpy(ifr.ifr_name, ifa_name, IFNAMSIZ);
	// 获取MAC地址
	ret = ioctl(sockfd, SIOCGIFHWADDR, &ifr);
	if (ret < 0)
	{
		perror("ioctl");
		close(sockfd);
		return -1;
	}
	// 复制MAC地址到输出参数
	memcpy(mac_addr, ifr.ifr_hwaddr.sa_data, 6);
	// 关闭套接字
	close(sockfd);
	return 0;
}

// 将 MAC 地址转换为小写字符串
void macToLowerCase(unsigned char *mac_addr, char *mac_str)
{
	sprintf(mac_str, "%02x:%02x:%02x:%02x:%02x:%02x",
					mac_addr[0], mac_addr[1], mac_addr[2],
					mac_addr[3], mac_addr[4], mac_addr[5]);
}

int send_udp(struct sockaddr_in6 server_addr, char *msg)
{
	int sockfd;
	char buffer[BUFFER_SIZE];
	strcpy(buffer, msg);

	// 创建套接字
	if ((sockfd = socket(AF_INET6, SOCK_DGRAM, 0)) == -1)
	{
		perror("socket creation failed");
		exit(EXIT_FAILURE);
	}
	while (1)
	{
		// 发送数据
		if (sendto(sockfd, buffer, strlen(buffer), 0, (struct sockaddr *)&server_addr, sizeof(server_addr)) == -1)
		{
			perror("sendto failed");
			// exit(EXIT_FAILURE);
		}
		sleep(1);
	}
}

int send_udp_to_domain(char *sDomain, char *msg)
{
	struct addrinfo hints, *res, *p;
	int status;
	char ipstr[INET6_ADDRSTRLEN];

	memset(&hints, 0, sizeof hints);
	hints.ai_family = AF_UNSPEC; // AF_INET or AF_INET6 to force version
	hints.ai_socktype = SOCK_STREAM;

	if ((status = getaddrinfo(sDomain, NULL, &hints, &res)) != 0)
	{
		fprintf(stderr, "getaddrinfo: %s\n", gai_strerror(status));
		exit(EXIT_FAILURE);
	}

	for (p = res; p != NULL; p = p->ai_next)
	{
		void *addr;

		if (p->ai_family == AF_INET6)
		{
			struct sockaddr_in6 *ipv6 = (struct sockaddr_in6 *)p->ai_addr;
			addr = &(ipv6->sin6_addr);
			inet_ntop(p->ai_family, addr, ipstr, sizeof ipstr);
			ipv6->sin6_port = htons(SERVER_PORT);
			send_udp(*ipv6, msg);
			puts(ipstr);
		}
	}

	freeaddrinfo(res);
	return 0;
}

int main(int argc, char *argv[])
{
	// 尝试创建 PID 文件
	if (lock_pid_file(extract_filename(argv[0])) == -1)
	{
		// 创建 PID 文件失败，程序退出
		exit(EXIT_FAILURE);
	}
	char *interface_name = getPublicIpv6InterfaceName();
	printf("Interface Name : %s\n", interface_name);
	char mac_str[18];
	unsigned char mac_address[6];
	if (getMACAddress(interface_name, mac_address) == 0)
	{
		macToLowerCase(mac_address, mac_str);
		printf("MAC Address of %s: %s\n", interface_name, mac_str);
		send_udp_to_domain(SERVER_ADDR, mac_str);
	}
	else
	{
		printf("Failed to get MAC Address of %s\n", interface_name);
	}
	return 0;
}
